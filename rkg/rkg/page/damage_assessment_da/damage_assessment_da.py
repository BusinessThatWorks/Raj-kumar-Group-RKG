import frappe
from frappe.utils import flt

@frappe.whitelist()
def get_filters():
    return {
        "load_dispatches": frappe.get_all(
            "Load Dispatch", pluck="name"
        ),
        "warehouses": frappe.get_all(
            "Warehouse", pluck="name"
        )
    }


@frappe.whitelist()
def get_dashboard_data(load_dispatch=None, status=None, warehouse=None):

    conditions = []
    params = {}

    if load_dispatch:
        conditions.append("da.load_dispatch = %(load_dispatch)s")
        params["load_dispatch"] = load_dispatch

    if status:
        conditions.append("dai.status = %(status)s")
        params["status"] = status

    if warehouse:
        conditions.append("ld.warehouse = %(warehouse)s")
        params["warehouse"] = warehouse

    where_clause = " AND ".join(conditions)
    if where_clause:
        where_clause = "WHERE " + where_clause

    rows = frappe.db.sql(f"""
        SELECT
            dai.frame_no,
            dai.status,
            da.load_dispatch,
            dai.load_reference_number,
            ld.warehouse,
            CONCAT_WS(', ', dai.issue_1, dai.issue_2, dai.issue_3) AS issues,
            dai.estimated_amount,
            da.date
        FROM `tabDamage Assessment Item` dai
        JOIN `tabDamage Assessment` da
            ON da.name = dai.parent
        JOIN `tabLoad Dispatch` ld
            ON ld.name = da.load_dispatch
        {where_clause}
        ORDER BY da.date DESC
    """, params, as_dict=True)

    total_frames = len(rows)
    damaged_frames = sum(1 for r in rows if r.status == "Not OK")
    total_cost = sum(
        flt(r.estimated_amount)
        for r in rows
        if r.status == "Not OK"
    )

    return {
        "total_frames": total_frames,
        "damaged_frames": damaged_frames,
        "total_cost": total_cost,
        "rows": rows
    }
