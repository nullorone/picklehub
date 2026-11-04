import { configureStore } from "@reduxjs/toolkit";
import { sessionReducer } from "./sessionSlice.ts";
import { locationReducer } from "./locationSlice.ts";

export const createAppStore = () =>
    configureStore({
        reducer: {
            session: sessionReducer,
            location: locationReducer,
        },
    });

export const store = createAppStore();

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
