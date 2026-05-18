from celery import Celery
import requests
import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "8469015792:AAHer6z93IlMyN_hF-1LPJdmMTcD3Zw77p4")
CHAT_ID = os.getenv("CHAT_ID", "1198878759")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Initialize Celery using Redis as the broker
celery_app = Celery("tasks", broker=REDIS_URL)

@celery_app.task
def send_telegram_message(text: str):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": CHAT_ID,
        "text": text,
        "parse_mode": "Markdown"
    }
    response = requests.post(url, json=payload)
    return response.json()
