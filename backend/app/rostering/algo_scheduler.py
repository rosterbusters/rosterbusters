#this is the algorithm scheduler
from app.rostering.milp_algo import run_milp_pipeline, MILPError
from app.rostering.ga_algo import run_ga_pipeline


def generate_roster(nurses, shifts, requests=None):
    """
    Generate a nurse roster using MILP (primary) or GA (fallback).
    
    Args:
        nurses: List of nurse dictionaries with structure:
            [
                {"id": int, "name": str, "rank": str},
                ...
            ]
            where rank is "A" (RN), "B" (EN), or "C" (HCA)
        
        shifts: List of daily shift requirements (one per day):
            [
                {
                    "AM":    {"A": int, "B": int, "C": int},
                    "PM":    {"A": int, "B": int, "C": int},
                    "NIGHT": {"A": int, "B": int, "C": int},
                },
                ...
            ]
        
        requests: Optional dict of nurse shift requests:
            {
                nurse_id: [(day_index, "SHIFT_NAME"), ...],
                ...
            }
            where day_index is 0-based and SHIFT_NAME is "AM", "PM", or "NIGHT"
    
    Returns:
        Standardized roster dictionary:
        {
            "method": str,  # "MILP" or "GA"
            "roster": {
                "nurses": [
                    {
                        "id": int,
                        "name": str,
                        "rank": str,
                        "schedule": [str, ...],  # shift names for each day
                        "stats": {
                            "total_shifts": int,
                            "am_shifts": int,
                            "pm_shifts": int,
                            "night_shifts": int,
                            "days_off": int
                        }
                    },
                    ...
                ],
                "metadata": {
                    "num_days": int,
                    "num_nurses": int,
                    "algorithm": str,
                    "solver_status": str (MILP only) or "penalty_score": float (GA only)
                }
            }
        }
    
    Raises:
        ValueError: If input validation fails
    """
    # Validate inputs
    validate_inputs(nurses, shifts, requests)
    
    # Try MILP first
    try:
        roster = run_milp_pipeline(nurses, shifts, requests)
        return {
            "method": "MILP",
            "roster": roster,
        }
    except MILPError as e:
        # Log the error if logging is configured
        print(f"MILP failed: {e}")
        
        # Fall back to GA
        roster = run_ga_pipeline(nurses, shifts, requests)
        return {
            "method": "GA",
            "roster": roster,
        }


def validate_inputs(nurses, shifts, requests):
    """
    Validate input data structure and values.
    
    Raises:
        ValueError: If validation fails
    """
    # Validate nurses
    if not isinstance(nurses, list) or not nurses:
        raise ValueError("nurses must be a non-empty list")
    
    required_nurse_keys = {"id", "name", "rank"}
    valid_ranks = {"A", "B", "C"}
    
    nurse_ids = set()
    for nurse in nurses:
        if not isinstance(nurse, dict):
            raise ValueError("Each nurse must be a dictionary")
        
        missing_keys = required_nurse_keys - set(nurse.keys())
        if missing_keys:
            raise ValueError(f"Nurse missing required keys: {missing_keys}")
        
        if nurse["rank"] not in valid_ranks:
            raise ValueError(f"Invalid rank '{nurse['rank']}'. Must be A, B, or C")
        
        if nurse["id"] in nurse_ids:
            raise ValueError(f"Duplicate nurse ID: {nurse['id']}")
        nurse_ids.add(nurse["id"])
    
    # Validate shifts
    if not isinstance(shifts, list) or not shifts:
        raise ValueError("shifts must be a non-empty list")
    
    valid_shift_names = {"AM", "PM", "NIGHT"}
    
    for day_idx, day_shifts in enumerate(shifts):
        if not isinstance(day_shifts, dict):
            raise ValueError(f"Day {day_idx} shifts must be a dictionary")
        
        for shift_name, requirements in day_shifts.items():
            if shift_name not in valid_shift_names:
                raise ValueError(f"Invalid shift name '{shift_name}'. Must be AM, PM, or NIGHT")
            
            if not isinstance(requirements, dict):
                raise ValueError(f"Requirements for {shift_name} on day {day_idx} must be a dictionary")
            
            for rank in requirements:
                if rank not in valid_ranks:
                    raise ValueError(f"Invalid rank '{rank}' in requirements")
                
                if not isinstance(requirements[rank], int) or requirements[rank] < 0:
                    raise ValueError(f"Requirement count must be a non-negative integer")
    
    # Validate requests (if provided)
    if requests is not None:
        if not isinstance(requests, dict):
            raise ValueError("requests must be a dictionary")
        
        num_days = len(shifts)
        
        for nurse_id, req_list in requests.items():
            if nurse_id not in nurse_ids:
                raise ValueError(f"Request for unknown nurse ID: {nurse_id}")
            
            if not isinstance(req_list, list):
                raise ValueError(f"Requests for nurse {nurse_id} must be a list")
            
            for day_idx, shift_name in req_list:
                if not (0 <= day_idx < num_days):
                    raise ValueError(f"Invalid day index {day_idx} (must be 0-{num_days-1})")
                
                if shift_name not in valid_shift_names:
                    raise ValueError(f"Invalid shift name '{shift_name}' in request")

