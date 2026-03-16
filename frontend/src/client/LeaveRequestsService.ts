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

export interface LeaveRequestCreate {
  nurseid?: number;
  startdate: string;  // YYYY-MM-DD
  enddate: string;    // YYYY-MM-DD
  leavetype: string;
  leavecategory?: string;
  reason?: string;
}

export interface ShiftCodePublic {
  shiftcode: string;
  description: string;
  isworking: boolean;
}

export class LeaveRequestsService {
  /**
   * Get all leave/off shift codes (isworking = false).
   */
  public static getLeaveCodes(): CancelablePromise<ShiftCodePublic[]> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/leave/leave-codes",
      errors: {
        422: "Validation Error",
      },
    });
  }

  /**
   * Submit a new leave request for the logged-in nurse.
   */
  public static createLeaveRequest(
    data: LeaveRequestCreate
  ): CancelablePromise<LeaveRequestPublic> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/leave/",
      body: data,
      mediaType: "application/json",
      errors: {
        400: "Bad Request",
        404: "Not Found",
        422: "Validation Error",
      },
    });
  }

  /**
   * Get all leave requests for the logged-in nurse.
   */
  public static getMyLeaveRequests(): CancelablePromise<LeaveRequestPublic[]> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/leave/me",
      errors: {
        422: "Validation Error",
      },
    });
  }

  /**
   * Get all leave requests for nurses in a specific ward.
   */
  public static getWardLeaveRequests(
    data: GetWardLeaveRequestsData
  ): CancelablePromise<LeaveRequestPublic[]> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/leave/ward/{ward_id}",
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

  /**
   * Approve or reject a leave request. Only a NurseManager can review.
   */
  public static reviewLeaveRequest(data: {
    leaveId: number;
    status: "Approved" | "Rejected";
  }): CancelablePromise<LeaveRequestPublic> {
    return __request(OpenAPI, {
      method: "PATCH",
      url: "/api/v1/leave/{leave_id}/review",
      path: { leave_id: data.leaveId },
      query: { status: data.status },
      errors: {
        404: "Not Found",
        422: "Validation Error",
      },
    });
  }

  /**
   * Update a leave request's type. Only the owning nurse can update.
   */
  public static updateLeaveRequest(data: {
    leaveId: number;
    leavetype?: string;
    startdate?: string;
    enddate?: string;
  }): CancelablePromise<LeaveRequestPublic> {
    return __request(OpenAPI, {
      method: "PATCH",
      url: "/api/v1/leave/{leave_id}",
      path: { leave_id: data.leaveId },
      body: { leavetype: data.leavetype, startdate: data.startdate, enddate: data.enddate },
      mediaType: "application/json",
      errors: {
        403: "Forbidden",
        404: "Not Found",
        422: "Validation Error",
      },
    });
  }

  /**
   * Withdraw/delete a leave request. Only the owning nurse can delete.
   */
  public static deleteLeaveRequest(data: {
    leaveId: number;
  }): CancelablePromise<void> {
    return __request(OpenAPI, {
      method: "DELETE",
      url: "/api/v1/leave/{leave_id}",
      path: { leave_id: data.leaveId },
      errors: {
        403: "Forbidden",
        404: "Not Found",
        422: "Validation Error",
      },
    });
  }
}
