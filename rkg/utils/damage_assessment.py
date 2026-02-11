# -*- coding: utf-8 -*-
import frappe
from frappe.utils import getdate


# ============================================================
# VALIDATION & LOAD DISPATCH FRAME COUNT UPDATE
# ============================================================

def update_load_dispatch_frame_counts(doc, method=None):

    # ---------------- SERVER SIDE VALIDATION ----------------
    if doc.docstatus == 0:

        if not doc.damage_assessment_items:
            frappe.throw("At least one Damage Assessment Item is required")

        for i, row in enumerate(doc.damage_assessment_items, start=1):

            if not row.frame_no:
                frappe.throw(f"Row {i}: Frame No is mandatory")

            if not row.from_warehouse:
                frappe.throw(f"Row {i}: From Warehouse is mandatory")

            # BUSINESS RULE
            # OK     → price CAN be 0
            # Not OK → price MUST be > 0
            if row.status == "Not OK" and (row.estimated_amount or 0) <= 0:
                frappe.throw(
                    f"Row {i}: Estimated Amount must be greater than 0 when status is Not OK"
                )

    # ---------------- FRAME COUNT UPDATE ----------------
    if not doc.load_dispatch:
        return

    if not frappe.db.exists("Load Dispatch", doc.load_dispatch):
        return

    da_names = frappe.get_all(
        "Damage Assessment",
        filters={"load_dispatch": doc.load_dispatch},
        pluck="name"
    )

    ok_count = frappe.db.count(
        "Damage Assessment Item",
        {
            "parent": ["in", da_names],
            "parenttype": "Damage Assessment",
            "status": "OK"
        }
    ) if da_names else 0

    not_ok_count = frappe.db.count(
        "Damage Assessment Item",
        {
            "parent": ["in", da_names],
            "parenttype": "Damage Assessment",
            "status": "Not OK"
        }
    ) if da_names else 0

    frappe.db.set_value(
        "Load Dispatch",
        doc.load_dispatch,
        {
            "frames_ok": ok_count,
            "frames_not_ok": not_ok_count
        },
        update_modified=False
    )


# ============================================================
# API : LOAD DISPATCH ITEMS
# ============================================================

@frappe.whitelist()
def get_items_from_load_dispatch(load_dispatch):

    if not load_dispatch:
        frappe.throw("Load Dispatch required")

    if not frappe.db.exists("Load Dispatch", load_dispatch):
        frappe.throw("Invalid Load Dispatch")

    ld = frappe.get_doc("Load Dispatch", load_dispatch)

    accepted_warehouse = frappe.db.get_value(
        "Purchase Receipt",
        {
            "custom_load_dispatch": load_dispatch,
            "docstatus": 1
        },
        "set_warehouse"
    )

    items = []
    for row in ld.items:
        items.append({
            "frame_no": row.item_code,
            "item_code": row.item_code,
            "qty": row.qty
        })

    return {
        "load_reference_number": ld.linked_load_reference_no,
        "accepted_warehouse": accepted_warehouse,
        "items": items
    }


# ============================================================
# CREATE PURCHASE RECEIPT (NO HIDE LOGIC)
# ============================================================

@frappe.whitelist()
def create_purchase_receipt(damage_assessment):

    da = frappe.get_doc("Damage Assessment", damage_assessment)

    if da.docstatus != 1:
        frappe.throw("Submit Damage Assessment first")

    supplier = frappe.db.get_value(
        "RKG Settings", {}, "default_supplier"
    )

    if not supplier:
        frappe.throw("Default Supplier not set in RKG Settings")

    pr = frappe.new_doc("Purchase Receipt")
    pr.supplier = supplier
    pr.posting_date = getdate()
    pr.set_posting_time = 1
    pr.custom_load_dispatch = da.load_dispatch
    pr.supplier_delivery_note = da.name

    # Prevent duplicate PR ITEMS only
    existing_frames = set(
        frappe.get_all(
            "Purchase Receipt Item",
            filters={
                "parenttype": "Purchase Receipt",
                "item_code": ["in", [d.frame_no for d in da.damage_assessment_items]]
            },
            pluck="item_code"
        )
    )

    added = False

    for row in da.damage_assessment_items:

        if row.status != "Not OK":
            continue

        if row.frame_no in existing_frames:
            continue

        pr.append("items", {
            "item_code": row.frame_no,
            "qty": 1,
            "rate": row.estimated_amount,
            "warehouse": row.from_warehouse
        })

        added = True

    if not added:
        frappe.throw("No new Not OK frames available for Purchase Receipt")

    pr.insert(ignore_permissions=True)
    #pr.submit()

    return pr.name
