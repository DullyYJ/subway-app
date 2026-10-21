package com.google.android.gms.tasks;
public abstract class Task<R> { public abstract Task<R> addOnSuccessListener(OnSuccessListener<? super R> l); public abstract Task<R> addOnFailureListener(OnFailureListener l); }
