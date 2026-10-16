"""FastAPI web server for the HR Policy Assistant with ChatGPT-style UI.

Replaces Streamlit with a modern, responsive web application served on port 8501.
"""

import os
from contextlib import asynccontextmanager
from typing import List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from hr_assistant.logger import get_logger
from hr_assistant.pipeline import ask, build_hr_assistant

logger = get_logger(__name__)

# Global agent instance
assistant_agent = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the RAG agent once when the server boots up."""
    global assistant_agent
    logger.info("=== Starting HR Policy Assistant Web Service ===")
    try:
        assistant_agent = build_hr_assistant()
        logger.info("=== HR Policy Assistant agent ready ===")
    except Exception as e:
        logger.error("Failed to build HR assistant: %s", e, exc_info=True)
    yield
    logger.info("=== Shutting down HR Policy Assistant Web Service ===")


app = FastAPI(
    title="HR Policy Assistant API",
    description="ChatGPT-style Web Application for Acme Corp HR Policy Handbook",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS middleware for smooth local development / embedding
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static assets
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")


class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Question from the user")
    history: Optional[List[ChatMessage]] = Field(default=[], description="Previous conversation messages")


class ChatResponse(BaseModel):
    answer: str
    status: str = "success"


@app.get("/")
async def serve_index():
    """Serve the ChatGPT-style single page application."""
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse(
        {"message": "HR Policy Assistant is running. Please ensure static/index.html exists."},
        status_code=200,
    )


@app.get("/_stcore/health")
@app.get("/health")
async def health_check():
    """Health check endpoint for Docker container and deployment checks."""
    return {"status": "ok", "agent_loaded": assistant_agent is not None}


@app.get("/api/policies")
async def list_policy_topics():
    """Return quick policy suggestions and categories for the UI."""
    return {
        "categories": [
            {
                "title": "Time Off & Leave",
                "icon": "calendar",
                "questions": [
                    "How many paid annual leave days do I get per year?",
                    "What is the sick leave and medical certificate rule?",
                    "How many unused annual leave days can I carry forward?",
                ],
            },
            {
                "title": "Work Models & Flexibility",
                "icon": "laptop",
                "questions": [
                    "How many days per week can I work from home?",
                    "What are the core collaboration hours for remote work?",
                ],
            },
            {
                "title": "Parental & Family Care",
                "icon": "users",
                "questions": [
                    "What are the maternity and paternity leave benefits?",
                    "How many days of bereavement leave are provided?",
                ],
            },
            {
                "title": "Benefits & Allowances",
                "icon": "shield",
                "questions": [
                    "What is our health insurance coverage amount?",
                    "How much is the annual learning and certification allowance?",
                    "What are the payout amounts for the Employee Referral Bonus?",
                ],
            },
            {
                "title": "Employment & Exit",
                "icon": "briefcase",
                "questions": [
                    "How long is the probation period and notice period?",
                    "What are the rules regarding moonlighting or secondary jobs?",
                    "How many days does full and final settlement take upon resignation?",
                ],
            },
        ]
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest):
    """Process a user query through the RAG pipeline."""
    global assistant_agent
    if assistant_agent is None:
        logger.info("Lazy-loading HR Assistant agent on first request...")
        assistant_agent = build_hr_assistant()

    user_query = payload.message.strip()
    if not user_query:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    logger.info("=== Web API: new question received: '%s' ===", user_query)
    try:
        answer = ask(assistant_agent, user_query)
        return ChatResponse(answer=answer, status="success")
    except Exception as e:
        logger.error("Error processing question '%s': %s", user_query, e, exc_info=True)
        return ChatResponse(
            answer=f"Sorry, an error occurred while processing your request: {str(e)}",
            status="error",
        )


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8501))
    logger.info("Starting Uvicorn server on http://0.0.0.0:%d", port)
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
