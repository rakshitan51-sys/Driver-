from pydantic import BaseModel
from typing import Optional

# Driver
class DriverRegister(BaseModel):
    name: str
    driverId: Optional[str] = None   # auto-generated if not provided
    password: str
    phone: str
    licence: str

class DriverLogin(BaseModel):
    driverId: str
    password: str

# Route Assignment (from admin)
class AssignRoute(BaseModel):
    driverId: str
    busNo: Optional[str] = None
    bus_no: Optional[str] = None   # ✅ accept both field names from admin
    route: str

# Location
class Location(BaseModel):
    driverId: str
    lat: float
    lng: float

# Boarding
class BoardAction(BaseModel):
    student_rollNo: str
    driverId: str
    route: str
    bus_no: str
    time: str

# Trip
class Trip(BaseModel):
    driverId: str
    bus_no: str
    route: str
    start_time: str
    end_time: Optional[str] = None
    boarded: int = 0
    boarded_out: int = 0
    total_students: int = 0
    status: str = "ongoing"
