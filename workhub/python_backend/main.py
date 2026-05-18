from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import redis
import socketio
import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "8469015792:AAHer6z93IlMyN_hF-1LPJdmMTcD3Zw77p4")
CHAT_ID = os.getenv("CHAT_ID", "1198878759")

def send_telegram_notification(text: str):
    try:
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        payload = {"chat_id": CHAT_ID, "text": text, "parse_mode": "Markdown"}
        requests.post(url, json=payload, timeout=10)
    except Exception as e:
        print("Telegram notification error:", e)

START_TIME = time.time()

app = FastAPI()

# Enable CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO Server integrated with FastAPI
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Redis Connection
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
r = redis.from_url(REDIS_URL, decode_responses=True)

class Order(BaseModel):
    name: str
    phone: str
    service: str
    message: str = ""

class ChatMessage(BaseModel):
    message: str

@sio.event
async def connect(sid, environ):
    print("Socket.IO client connected:", sid)

@sio.event
async def disconnect(sid):
    print("Socket.IO client disconnected:", sid)

@app.get("/api/health")
def health_check():
    try:
        r.ping()
        redis_status = "connected"
    except redis.ConnectionError:
        redis_status = "disconnected"
    return {"status": "ok", "redis": redis_status, "uptime": time.time() - START_TIME}

@app.get("/api/redis/stats")
def redis_stats():
    try:
        info = r.info()
        return {
            "memory": info.get("used_memory_human", "0B"),
            "keys": r.dbsize()
        }
    except:
        return {"memory": "N/A", "keys": 0}

@app.get("/api/queues/status")
def queue_status():
    # Basic mock for Celery queue length in Redis
    try:
        length = r.llen("celery")
        return {"telegram": {"waiting": length, "active": 0, "completed": 0, "failed": 0}}
    except:
        return {"telegram": {"waiting": 0, "active": 0, "completed": 0, "failed": 0}}

@app.post("/api/orders")
async def create_order(order: Order, background_tasks: BackgroundTasks):
    # Save to Redis
    order_id = r.incr("order_id_counter")
    order_data = order.dict()
    order_data["id"] = order_id
    r.hset(f"order:{order_id}", mapping=order_data)
    
    # Send Telegram in background safely without Celery (100% free)
    msg = f"💼 *WORK HUB: NEW INQUIRY*\n\n👤 *Ism:* {order.name}\n📞 *Tel:* {order.phone}\n🛠️ *Xizmat:* {order.service}\n💬 *Xabar:* {order.message}\n\n_Sent via Python/FastAPI_"
    background_tasks.add_task(send_telegram_notification, msg)
    
    # Real-time notification
    await sio.emit("notification", {
        "icon": "📦", 
        "title": "Yangi Buyurtma", 
        "text": f"{order.name} - {order.service}"
    })
    
    return {"success": True, "id": order_id}

@app.post("/api/chat")
async def send_chat(chat: ChatMessage, background_tasks: BackgroundTasks):
    msg = f"💬 *WORK HUB: NEW CHAT*\n\n💬 *Xabar:* ${chat.message}\n\n_Sent via Python/FastAPI_"
    background_tasks.add_task(send_telegram_notification, msg)
    
    await sio.emit("notification", {
        "icon": "💬", 
        "title": "Yangi xabar", 
        "text": chat.message
    })
    return {"success": True}

# Serve Frontend Static Files
app.mount("/", StaticFiles(directory="..", html=True), name="static")
