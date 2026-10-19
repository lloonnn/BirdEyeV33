package com.birdeye

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Upload scheduling. Two WorkManager jobs, both needing a network connection, with exponential backoff:
 * a periodic job every upload_interval_s (WorkManager's minimum is 15 minutes) and a one-off job after
 * each enqueue. Unique names keep them from piling up.
 */
object Uploads {
    private const val PERIODIC = "upload-periodic"
    private const val NOW = "upload-now"

    private val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun schedulePeriodic(context: Context) {
        val settings = Settings.app(context)
        val intervalS = maxOf(Settings.config(context).uploadIntervalS.toLong(), 15 * 60L)
        val request = PeriodicWorkRequestBuilder<UploadWorker>(intervalS, TimeUnit.SECONDS)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, settings.uploadBackoffS.toLong(), TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /** Delay before a one-off upload: duplicate_time_s plus 2 s, so the duplicate window closes first. */
    fun oneOffDelayS(config: ConfigV0): Long = (config.duplicateTimeS + 2).toLong()

    /**
     * KEEP: if a one-off job is already waiting or running, this adds nothing. The worker loops until no
     * old-enough record is left, and queues a follow-up job while younger ones are still waiting.
     */
    fun uploadNow(context: Context) = enqueueOneOff(context, ExistingWorkPolicy.KEEP)

    /**
     * Called by the running worker when younger records are still waiting. APPEND_OR_REPLACE, because
     * KEEP would see the running job and add nothing; the follow-up runs after it, under the same name.
     */
    fun uploadFollowUp(context: Context) = enqueueOneOff(context, ExistingWorkPolicy.APPEND_OR_REPLACE)

    private fun enqueueOneOff(context: Context, policy: ExistingWorkPolicy) {
        val settings = Settings.app(context)
        val request = OneTimeWorkRequestBuilder<UploadWorker>()
            .setInitialDelay(oneOffDelayS(Settings.config(context)), TimeUnit.SECONDS)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, settings.uploadBackoffS.toLong(), TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(NOW, policy, request)
    }
}

/** Runs [BatchUploader] against the Room queue and the API from [Api.get]. */
class UploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val uploader = BatchUploader(
            api = Api.get(applicationContext),
            store = DetectionQueue(applicationContext),
            batchSize = Settings.app(applicationContext).uploadMaxRecords,
            minAgeMs = (Settings.config(applicationContext).duplicateTimeS * 1000).toLong(),
            log = { Log.i("BirdEye", it) },
        )
        return when (uploader.run()) {
            BatchUploader.Outcome.Done -> Result.success()
            BatchUploader.Outcome.DoneYoungerWaiting -> {
                Uploads.uploadFollowUp(applicationContext)
                Result.success()
            }
            BatchUploader.Outcome.Retry -> Result.retry()
        }
    }
}
