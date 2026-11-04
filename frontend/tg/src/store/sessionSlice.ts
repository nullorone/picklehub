import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { components } from "@picklehub/api";

export type SessionUser = components["schemas"]["SessionUser"];

interface SessionState {
    user: SessionUser | null;
    avatarUrl: string | null;
}

const initialState: SessionState = {
    user: null,
    avatarUrl: null,
};

const sessionSlice = createSlice({
    name: "session",
    initialState,
    reducers: {
        sessionStarted(
            _state,
            action: PayloadAction<{
                user: SessionUser;
                avatarUrl: string | null;
            }>,
        ) {
            return action.payload;
        },
        sessionCleared() {
            return initialState;
        },
    },
});

export const { sessionStarted, sessionCleared } = sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;
