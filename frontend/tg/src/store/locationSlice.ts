import {
    createAsyncThunk,
    createSlice,
    type PayloadAction,
} from "@reduxjs/toolkit";
import { sessionCleared } from "./sessionSlice";

export type UserLocation =
    | { source: "manual"; name: string }
    | {
          source: "device";
          name: string;
          latitude: number;
          longitude: number;
          accuracy: number;
      };

interface LocationState {
    selected: UserLocation | null;
    requestId: string | null;
    error: string | null;
}

const initialState: LocationState = {
    selected: null,
    requestId: null,
    error: null,
};

export const detectLocation = createAsyncThunk<
    UserLocation | null,
    { requestPermission: boolean },
    { state: { location: LocationState }; rejectValue: string }
>(
    "location/detect",
    async ({ requestPermission }, { rejectWithValue }) => {
        if (!navigator.geolocation)
            return rejectWithValue(
                "Геолокация недоступна. Выберите город вручную.",
            );
        if (!requestPermission) {
            try {
                const permission = await navigator.permissions.query({
                    name: "geolocation",
                });
                if (permission.state !== "granted") return null;
            } catch {
                return null;
            }
        }
        try {
            const position = await new Promise<GeolocationPosition>(
                (resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: false,
                        timeout: 10000,
                        maximumAge: 300000,
                    });
                },
            );
            return {
                source: "device",
                name: "Текущее местоположение",
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
            };
        } catch {
            return rejectWithValue(
                "Не удалось определить местоположение. Проверьте разрешение или выберите город вручную.",
            );
        }
    },
    {
        condition: ({ requestPermission }, { getState }) => {
            const { location } = getState();
            return (
                !location.requestId && (requestPermission || !location.selected)
            );
        },
    },
);

const locationSlice = createSlice({
    name: "location",
    initialState,
    reducers: {
        locationSelected(state, action: PayloadAction<string>) {
            state.selected = { source: "manual", name: action.payload };
            state.requestId = null;
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder.addCase(sessionCleared, () => initialState);
        builder.addCase(detectLocation.pending, (state, action) => {
            state.requestId = action.meta.requestId;
            state.error = null;
        });
        builder.addCase(detectLocation.fulfilled, (state, action) => {
            if (state.requestId !== action.meta.requestId) return;
            state.requestId = null;
            if (action.payload) state.selected = action.payload;
        });
        builder.addCase(detectLocation.rejected, (state, action) => {
            if (state.requestId !== action.meta.requestId) return;
            state.requestId = null;
            state.error =
                action.payload ?? "Не удалось определить местоположение.";
        });
    },
});

export const { locationSelected } = locationSlice.actions;
export const locationReducer = locationSlice.reducer;
