"use client";
import { createContext } from "react";
import type { BookingQuote } from "@/features/bookings/booking-quote";
export const BookingQuoteContext = createContext<BookingQuote | undefined>(undefined);
