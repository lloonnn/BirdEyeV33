class AgentError(Exception):
    """A run cannot continue (no key, no model name, Gemini failed)."""


class ToolError(Exception):
    """A guardrail refused a tool call. The message goes back to the model."""
