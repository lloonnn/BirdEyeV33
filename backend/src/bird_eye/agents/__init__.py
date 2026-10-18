"""The two agents (decision 92): a work order agent and a daily brief agent.

They read defects and save drafts. No tool changes a defect's status or sends anything out.
`google-genai` is imported only in `gemini.py`, and only when a run needs a real model.
"""
