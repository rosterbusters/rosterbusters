"use client"

import { toaster } from "./toaster"

export type AppToastOptions = Parameters<typeof toaster.create>[0]

export const createToast = (options: AppToastOptions) => toaster.create(options)

export const showSuccessToast = (
  description: string,
  options: Omit<Partial<AppToastOptions>, "description" | "type"> = {},
) =>
  createToast({
    title: "Success!",
    duration: 3000,
    ...options,
    description,
    type: "success",
  })

export const showErrorToast = (
  description: string,
  options: Omit<Partial<AppToastOptions>, "description" | "type"> = {},
) =>
  createToast({
    title: "Something went wrong!",
    duration: 3000,
    ...options,
    description,
    type: "error",
  })
