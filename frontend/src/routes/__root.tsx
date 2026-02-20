import { createRootRoute, Outlet } from "@tanstack/react-router"
import React, { Suspense } from "react"
import { z } from "zod"

import NotFound from "@/components/Common/NotFound"

const rootSearchSchema = z.object({}).catch({})

const loadDevtools = () =>
  Promise.all([
    import("@tanstack/router-devtools"),
    import("@tanstack/react-query-devtools"),
  ]).then(([routerDevtools, reactQueryDevtools]) => {
    return {
      default: () => (
        <>
          <routerDevtools.TanStackRouterDevtools />
          <reactQueryDevtools.ReactQueryDevtools />
        </>
      ),
    }
  })

const TanStackDevtools =
  process.env.NODE_ENV === "production" ? () => null : React.lazy(loadDevtools)

export const Route = createRootRoute({
  validateSearch: (search) => rootSearchSchema.parse(search),
  component: () => (
    <>
      <Outlet />
      <Suspense>
        <TanStackDevtools />
      </Suspense>

    </>
  ),
  notFoundComponent: () => <NotFound />,
})
