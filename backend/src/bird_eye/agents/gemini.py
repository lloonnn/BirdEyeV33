"""The Gemini side of the loop: the only module that imports google-genai."""

from typing import Any

from google import genai
from google.genai import types

from bird_eye.agents.errors import AgentError
from bird_eye.agents.messages import Call, ToolResult
from bird_eye.settings import Settings


class GeminiModel:
    """One conversation. `send` takes the goal or the tool results and returns the model's tool calls."""

    def __init__(self, api_key: str, model: str, system: str, declarations: list[dict[str, Any]]) -> None:
        # Keep the client: when it is garbage collected the SDK closes its HTTP connection.
        self._client = genai.Client(api_key=api_key)
        functions = [
            types.FunctionDeclaration(
                name=d["name"], description=d["description"], parameters_json_schema=d["parameters"]
            )
            for d in declarations
        ]
        config = types.GenerateContentConfig(
            system_instruction=system,
            tools=[types.Tool(function_declarations=functions)],
            # The loop in bird_eye.agents.loop runs the tools, not the SDK.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        self._chat = self._client.chats.create(model=model, config=config)

    def send(self, message: str | list[ToolResult]) -> list[Call]:
        if isinstance(message, str):
            response = self._chat.send_message(message)
        else:
            parts = [types.Part.from_function_response(name=r.name, response=r.result) for r in message]
            response = self._chat.send_message(parts)
        return [Call(c.name, dict(c.args or {})) for c in (response.function_calls or [])]


def make_model(settings: Settings, system: str, declarations: list[dict[str, Any]]) -> GeminiModel:
    if not settings.gemini_api_key:
        raise AgentError("GEMINI_API_KEY is not set")
    if not settings.gemini_model:
        raise AgentError("GEMINI_MODEL is not set")
    return GeminiModel(settings.gemini_api_key, settings.gemini_model, system, declarations)
