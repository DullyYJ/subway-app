package com.google.android.gms.location;
import com.google.android.gms.tasks.*;
public interface FusedLocationProviderClient { Task<android.location.Location> getCurrentLocation(CurrentLocationRequest r, CancellationToken t); Task<Void> requestLocationUpdates(LocationRequest r, LocationCallback c, android.os.Looper l); Task<Void> removeLocationUpdates(LocationCallback c); }
