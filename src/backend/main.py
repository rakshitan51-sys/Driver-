from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from models import AssignRoute, Location, BoardAction
from database import drivers_col, students_col, locations_col, boarding_col, trips_col
from bson import ObjectId
from datetime import datetime
from typing import List
import asyncio

app = FastAPI(title="College Bus Tracking - Driver API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ═══════════════════════════════════════════
# 🔌 WebSocket Manager
# ═══════════════════════════════════════════

class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active.remove(ws)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await asyncio.sleep(30)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


# ═══════════════════════════════════════════
# 🚗 DRIVER AUTH
# ═══════════════════════════════════════════

def serialize(doc):
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc

def generate_driver_id() -> str:
    count = drivers_col.count_documents({})
    return str(count + 1).zfill(2)


@app.post("/driver/register")
def register_driver(data: dict):
    name     = str(data.get("name",    "")).strip()
    password = str(data.get("password","")).strip()
    phone    = str(data.get("phone",   "")).strip()
    licence  = str(data.get("licence", "")).strip()

    if not name or not password or not phone or not licence:
        return {"error": "All fields (name, password, phone, licence) are required"}

    driver_id = str(data.get("driverId") or "").strip()
    if not driver_id:
        driver_id = generate_driver_id()

    if drivers_col.find_one({"driverId": driver_id}):
        return {"error": f"Driver ID '{driver_id}' already registered"}

    new_driver = {
        "driverId": driver_id,
        "name":     name,
        "password": password,
        "phone":    phone,
        "licence":  licence,
        "busNo":    "—",
        "route":    "—",
    }
    drivers_col.insert_one(new_driver)
    return {
        "status":   "Registered",
        "driverId": driver_id,
        "message":  "Driver registered successfully ✅"
    }


# ✅ KEY FIX: Changed from `creds: DriverLogin` to `data: dict`
# DriverLogin Pydantic model was causing FastAPI to return 404/422
# when field names didn't match exactly — using dict avoids this entirely
@app.post("/driver/login")
def login_driver(data: dict):
    # ✅ Accept both camelCase and snake_case field names from frontend
    driver_id = str(data.get("driverId") or data.get("driver_id") or "").strip()
    password  = str(data.get("password") or "").strip()

    if not driver_id or not password:
        return {"error": "Driver ID and password are required"}

    doc = drivers_col.find_one({
        "driverId": driver_id,
        "password": password
    })

    if not doc:
        return {"error": "Invalid Driver ID or password ❌"}

    # ✅ Serialize and return full driver doc so frontend has all fields
    return serialize(doc)


@app.get("/driver/{driverId}")
def get_driver(driverId: str):
    doc = drivers_col.find_one({"driverId": driverId})
    if doc:
        return serialize(doc)
    return {"error": "Driver not found"}


@app.get("/drivers")
def get_all_drivers():
    docs = list(drivers_col.find({}))
    result = []
    for d in docs:
        d["_id"] = str(d["_id"])
        result.append({
            "_id":      d.get("_id"),
            "name":     d.get("name",     "—"),
            "driverId": d.get("driverId", "—"),
            "phone":    d.get("phone",    "—"),
            "licence":  d.get("licence",  "—"),
            "busNo":    d.get("busNo",    "—"),
            "route":    d.get("route",    "—"),
        })
    return result


# ═══════════════════════════════════════════
# 🛣️ ROUTE ASSIGNMENT (called by admin)
# ═══════════════════════════════════════════

@app.post("/assign-route")
async def assign_route(data: AssignRoute):
    result = drivers_col.update_one(
        {"driverId": data.driverId},
        {"$set": {
            "busNo":       data.busNo,
            "route":       data.route,
            "assigned_at": datetime.utcnow().isoformat()
        }}
    )
    if result.modified_count == 0:
        return {"error": "Driver not found or route unchanged"}

    await manager.broadcast({
        "type":     "route",
        "driverId": data.driverId,
        "busNo":    data.busNo,
        "route":    data.route
    })
    return {"status": "Route assigned", "driverId": data.driverId}


# ═══════════════════════════════════════════
# 👨‍🎓 STUDENTS (filter by route)
# ═══════════════════════════════════════════

@app.get("/students/route/{route_name}")
def get_students_by_route(route_name: str):
    today = datetime.utcnow().date().isoformat()
    raw_students = list(students_col.find({"route": route_name}))
    result = []

    for s in raw_students:
        s["_id"] = str(s["_id"])
        boarding = boarding_col.find_one({
            "student_rollNo": s.get("rollNo", ""),
            "date": today
        })
        if boarding:
            s["status"]         = boarding.get("action", "none")
            s["check_in_time"]  = boarding.get("check_in_time")
            s["check_out_time"] = boarding.get("check_out_time")
        else:
            s["status"]         = "none"
            s["check_in_time"]  = None
            s["check_out_time"] = None
        result.append(s)

    return result


# ═══════════════════════════════════════════
# 🚪 BOARD IN / BOARD OUT
# ═══════════════════════════════════════════

def _get_board_counts(driverId: str, route: str, date: str):
    boarded     = boarding_col.count_documents({"driverId": driverId, "date": date, "action": "boarded"})
    boarded_out = boarding_col.count_documents({"driverId": driverId, "date": date, "action": "boardedout"})
    return {"boarded": boarded, "boarded_out": boarded_out}


@app.post("/board-in")
async def board_in(action: BoardAction):
    today = datetime.utcnow().date().isoformat()
    boarding_col.update_one(
        {"student_rollNo": action.student_rollNo, "date": today},
        {"$set": {
            "student_rollNo": action.student_rollNo,
            "driverId":       action.driverId,
            "route":          action.route,
            "bus_no":         action.bus_no,
            "action":         "boarded",
            "check_in_time":  action.time,
            "date":           today
        }},
        upsert=True
    )
    counts = _get_board_counts(action.driverId, action.route, today)
    await manager.broadcast({
        "type":       "board_update",
        "driverId":   action.driverId,
        "boarded":    counts["boarded"],
        "boardedOut": counts["boarded_out"]
    })
    return {"status": "Boarded In", "student": action.student_rollNo}


@app.post("/board-out")
async def board_out(action: BoardAction):
    today = datetime.utcnow().date().isoformat()
    boarding_col.update_one(
        {"student_rollNo": action.student_rollNo, "date": today},
        {"$set": {
            "student_rollNo":  action.student_rollNo,
            "driverId":        action.driverId,
            "route":           action.route,
            "bus_no":          action.bus_no,
            "action":          "boardedout",
            "check_out_time":  action.time,
            "date":            today
        }},
        upsert=True
    )
    counts = _get_board_counts(action.driverId, action.route, today)
    await manager.broadcast({
        "type":       "board_update",
        "driverId":   action.driverId,
        "boarded":    counts["boarded"],
        "boardedOut": counts["boarded_out"]
    })
    return {"status": "Boarded Out", "student": action.student_rollNo}


@app.get("/board-counts/{driverId}")
def get_board_counts(driverId: str):
    today  = datetime.utcnow().date().isoformat()
    driver = drivers_col.find_one({"driverId": driverId})
    route  = driver.get("route", "") if driver else ""
    return _get_board_counts(driverId, route, today)


# ═══════════════════════════════════════════
# 📍 LIVE LOCATION
# ═══════════════════════════════════════════

@app.post("/location")
async def update_location(loc: Location):
    driver = drivers_col.find_one({"driverId": loc.driverId})
    bus_no = driver.get("busNo", "—") if driver else "—"
    route  = driver.get("route",  "—") if driver else "—"
    name   = driver.get("name",   "—") if driver else "—"

    locations_col.update_one(
        {"driverId": loc.driverId},
        {"$set": {
            "driverId":   loc.driverId,
            "lat":        loc.lat,
            "lng":        loc.lng,
            "busNo":      bus_no,
            "route":      route,
            "name":       name,
            "updated_at": datetime.utcnow().isoformat()
        }},
        upsert=True
    )
    await manager.broadcast({
        "type":     "location",
        "driverId": loc.driverId,
        "lat":      loc.lat,
        "lng":      loc.lng,
        "busNo":    bus_no,
        "route":    route,
        "name":     name,
    })
    return {"status": "Location updated"}


@app.get("/location/{driverId}")
def get_location(driverId: str):
    doc = locations_col.find_one({"driverId": driverId})
    if doc:
        doc["_id"] = str(doc["_id"])
        return doc
    return {"error": "No location found"}


@app.get("/locations/all")
def get_all_locations():
    docs = list(locations_col.find({}))
    for d in docs:
        d["_id"] = str(d["_id"])
    return docs



# ═══════════════════════════════════════════
# 📊 ADMIN — boarding today
# ═══════════════════════════════════════════

@app.get("/boarding/today")
def get_today_boarding():
    today = datetime.utcnow().date().isoformat()
    docs = list(boarding_col.find({"date": today}))
    for d in docs:
        d["_id"] = str(d["_id"])
    return docs


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)