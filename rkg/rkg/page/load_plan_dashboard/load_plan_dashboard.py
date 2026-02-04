# -*- coding: utf-8 -*-
import frappe
from frappe.utils import getdate, flt

@frappe.whitelist()
def get_filter_options(doctype):
    """Return distinct filter options for dashboard"""
    statuses = []
    load_refs = []

    if doctype == "Load Plan":
        statuses = [r.status for r in frappe.get_all("Load Plan", fields=["status"], distinct=True) if r.status]
        load_refs = [r.load_reference_no for r in frappe.get_all("Load Plan", fields=["load_reference_no"], distinct=True) if r.load_reference_no]
    elif doctype == "Load Dispatch":
        statuses = [r.status for r in frappe.get_all("Load Dispatch", fields=["status"], distinct=True) if r.status]
        load_refs = [r.load_reference_no_linked_to_load_plan for r in frappe.get_all("Load Dispatch", fields=["load_reference_no_linked_to_load_plan"], distinct=True) if r.load_reference_no_linked_to_load_plan]

    return {"statuses": sorted(list(set(statuses))), "load_references": sorted(list(set(load_refs)))}


@frappe.whitelist()
def get_dashboard_data(doctype, status=None, load_reference=None, from_date=None, to_date=None):
    """Return dashboard summary and data"""
    filters = {}
    if status:
        filters["status"] = status
    if from_date:
        filters["date"] = (">=", from_date)
    if to_date:
        filters["date"] = ("<=", to_date)

    if doctype == "Load Plan":
        plans = frappe.get_all("Load Plan", fields=[
            "name", "load_reference_no", "status", "dispatch_plan_date"
        ], filters=filters)

        if load_reference:
            plans = [p for p in plans if p.load_reference_no == load_reference]

        summary = {
            "total_plans": len(plans),
            "total_submitted_dispatches": frappe.db.count("Load Dispatch"),
            "total_dispatch_qty_sum": flt(frappe.db.sql("""SELECT SUM(total_dispatch_quantity) FROM `tabLoad Dispatch`""")[0][0] or 0)
        }

        for plan in plans:
            # Calculate total quantity from Load Plan Item table
            total_qty = flt(frappe.db.sql("""
                SELECT SUM(quantity) FROM `tabLoad Plan Item` WHERE parent=%s
            """, plan.name)[0][0] or 0)
            dispatched = flt(frappe.db.sql("""
                SELECT SUM(total_dispatch_quantity) FROM `tabLoad Dispatch` WHERE load_reference_no_linked_to_load_plan=%s
            """, plan.load_reference_no)[0][0] or 0)

            plan["total_quantity"] = total_qty
            plan["load_dispatch_quantity"] = dispatched

        return {"summary": summary, "plans": plans}

    elif doctype == "Load Dispatch":
        dispatches = frappe.get_all("Load Dispatch", fields=[
            "name", "dispatch_no", "load_reference_no_linked_to_load_plan", "status", "invoice_no",
            "total_load_quantity", "total_dispatch_quantity", "total_receipt_quantity",
            "total_billed_quantity"
        ], filters=filters)

        if load_reference:
            dispatches = [d for d in dispatches if d.load_reference_no_linked_to_load_plan == load_reference]

        # Update total_receipt_quantity from Purchase Receipt
        for d in dispatches:
            total_received = flt(frappe.db.sql("""
                SELECT SUM(total_qty) FROM `tabPurchase Receipt`
                WHERE custom_load_dispatch=%s AND docstatus=1
            """, d.name)[0][0] or 0)
            # Save back to DB if mismatch
            if total_received != flt(d.total_receipt_quantity or 0):
                frappe.db.set_value("Load Dispatch", d.name, "total_receipt_quantity", total_received)
            d["total_receipt_quantity"] = total_received

        summary = {
            "total_dispatches": len(dispatches),
            "total_dispatch_qty": sum([flt(d.total_dispatch_quantity or 0) for d in dispatches]),
            "total_receipt_quantity": sum([flt(d.total_receipt_quantity or 0) for d in dispatches]),
            "total_billed_qty": sum([flt(d.total_billed_quantity or 0) for d in dispatches])
        }

        for d in dispatches:
            d["receive_progress"] = round((flt(d.total_receipt_quantity or 0)/flt(d.total_dispatch_quantity or 1)*100), 2)
            d["bill_progress"] = round((flt(d.total_billed_quantity or 0)/flt(d.total_dispatch_quantity or 1)*100), 2)

        return {"summary": summary, "dispatches": dispatches}

    return {}
