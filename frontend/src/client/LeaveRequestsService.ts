// Manual LeaveRequestsService - works alongside sdk.gen.ts without requiring regeneration

import { OpenAPI } from "./core/OpenAPI";
import { request as __request } from "./core/request";
import type { CancelablePromise } from "./core/CancelablePromise";

export interface LeaveRequestPublic {
  leaveid: number;
  nurseid: number;
  startdate: string;
  enddate: string;
  leavetype: string;
  leavecategory: string;
  status: string;
  reason: string | null;
  requestedat: string;
}

export interface GetWardLeaveRequestsData {
  wardId: number;
  startDate?: string;
  endDate?: string;
}

export class LeaveRequestsService {
  /**
   * Get all leave requests for nurses in a specific ward.
   */
  public static getWardLeaveRequests(
    data: GetWardLeaveRequestsData
  ): CancelablePromise<LeaveRequestPublic[]> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/shift-requests/ward/{ward_id}/leave-requests",
      path: { ward_id: data.wardId },
      query: {
        start_date: data.startDate,
        end_date: data.endDate,
      },
      errors: {
        404: "Not Found",
        422: "Validation Error",
      },
    });
  }
}
