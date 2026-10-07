"use server";

// A module of Server Actions that fails to load, as one does that reads a
// missing environment variable at the top.
throw new Error("The actions of this module cannot load");

export async function unreachable() {}
