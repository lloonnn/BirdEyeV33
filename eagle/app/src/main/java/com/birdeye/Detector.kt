package com.birdeye

import android.content.Context
import android.graphics.Bitmap
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.GpuDelegate
import java.io.Closeable
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel

/** Finds defects in one upright camera frame. Call from a background thread, one call at a time. */
interface Detector : Closeable {
    /** "GPU" or "CPU": what the model runs on. */
    val backend: String

    /** Highest class probability of the last frame over all boxes, before any threshold; null before the first frame. */
    val lastTop: Pair<DefectType, Float>?

    /** Detections with score at least band_review_min, boxes normalised against [frame]. */
    fun detect(frame: Bitmap): List<Detection>
}

/**
 * LiteRT detector. Tries the GPU delegate first and falls back to the CPU if the delegate cannot be
 * created or the model does not load with it. Input [1, size, size, 3] float32, output [1, 6, n]
 * float32 (see [decode]). The model file is mapped from assets, where it is stored uncompressed.
 */
class LiteRtDetector(
    context: Context,
    modelAsset: String,
    private val inputSize: Int,
    private val reviewMin: Double,
    private val nmsIou: Double,
) : Detector {
    private var gpu: GpuDelegate? = null
    private val interpreter: Interpreter
    override val backend: String
    private val boxCount: Int
    private val input: ByteBuffer = ByteBuffer.allocateDirect(inputSize * inputSize * 3 * 4).order(ByteOrder.nativeOrder())
    private val output: ByteBuffer
    private val outputFloats: FloatArray

    init {
        val model = context.assets.openFd(modelAsset).use { fd ->
            fd.createInputStream().channel.map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
        }
        var made: Interpreter? = null
        var used = "CPU"
        try {
            val delegate = GpuDelegate()
            try {
                made = Interpreter(model, Interpreter.Options().addDelegate(delegate))
                gpu = delegate
                used = "GPU"
            } catch (e: Exception) {
                delegate.close()
                throw e
            }
        } catch (e: Throwable) {
            android.util.Log.w("BirdEye", "GPU delegate failed, using CPU", e)
        }
        interpreter = made ?: Interpreter(model, Interpreter.Options().setNumThreads(4))
        backend = used

        val inShape = interpreter.getInputTensor(0).shape()
        val outShape = interpreter.getOutputTensor(0).shape()
        require(inShape.contentEquals(intArrayOf(1, inputSize, inputSize, 3))) { "Unexpected model input ${inShape.toList()}" }
        require(outShape.size == 3 && outShape[0] == 1 && outShape[1] == 6) { "Unexpected model output ${outShape.toList()}" }
        boxCount = outShape[2]
        output = ByteBuffer.allocateDirect(6 * boxCount * 4).order(ByteOrder.nativeOrder())
        outputFloats = FloatArray(6 * boxCount)
    }

    override var lastTop: Pair<DefectType, Float>? = null
        private set

    override fun detect(frame: Bitmap): List<Detection> {
        val box = preprocess(frame, inputSize, input.asFloatBuffer())
        output.rewind()
        interpreter.run(input, output)
        output.rewind()
        output.asFloatBuffer().get(outputFloats)
        lastTop = topScore(outputFloats, boxCount)
        return decode(outputFloats, boxCount, box, reviewMin, nmsIou)
    }

    override fun close() {
        interpreter.close()
        gpu?.close()
    }
}
