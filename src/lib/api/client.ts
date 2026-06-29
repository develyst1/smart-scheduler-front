import axios from "axios";
import type { ApiError } from "@/types/api/contract";

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const baseURL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001/api";

export const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const body = error.response?.data as ApiError | undefined;
    if (body?.error) {
      throw new ApiClientError(body.error.code, body.error.message, error.response.status);
    }
    throw error;
  },
);

export const useMockData = process.env.NEXT_PUBLIC_USE_MOCK === "true";
