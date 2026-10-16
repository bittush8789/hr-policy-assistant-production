"""Step 6: connect to the LLM (the "brain" of the assistant)."""

from langchain_groq import ChatGroq

from hr_assistant import config
from hr_assistant.logger import get_logger

logger = get_logger(__name__)


def get_llm():
    """Return a Groq chat model. Reads GROQ_API_KEY from the environment."""
    if config.PORTKEY_API_KEY and config.PORTKEY_API_KEY != "your_portkey_api_key_here":
        try:
            from hr_assistant.gateway import get_gateway_llm
            logger.info("Initializing LLM via Portkey")
            return get_gateway_llm()
        except Exception as e:
            logger.warning("Failed to initialize Portkey (%s), falling back to Groq directly", e)

    logger.info("Initializing LLM directly via Groq (model=%s)", config.LLM_MODEL_NAME)
    return ChatGroq(model=config.LLM_MODEL_NAME)