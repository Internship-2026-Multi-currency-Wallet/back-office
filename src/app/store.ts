import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { settingWritesReducer } from '../features/settings/settingWrites';
import { api } from './api';

/** Root store. Each feature adds its slice here in a small, dedicated PR. */
export function createStore() {
  return configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      settingWrites: settingWritesReducer,
    },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });
}

export type AppStore = ReturnType<typeof createStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
