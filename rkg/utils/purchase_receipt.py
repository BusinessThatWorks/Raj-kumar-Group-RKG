# -*- coding: utf-8 -*-
import frappe


def validate_purchase_receipt(doc, method=None):
    """
    Enforce: Item Cost Center must ALWAYS match
    Purchase Receipt Cost Center
    """

    if not doc.cost_center:
        return

    for item in doc.items:
        item.cost_center = doc.cost_center


def on_submit_purchase_receipt(doc, method=None):
    """
    Update Load Dispatch & Load Plan when Purchase Receipt is submitted
    Assumption: 1 PR = 1 Load Dispatch
    """

    if not doc.custom_load_dispatch:
        return

    # 🔹 Load Dispatch
    ld = frappe.get_doc("Load Dispatch", doc.custom_load_dispatch)

    # Set receipt quantity
    ld.db_set("total_receipt_quantity", 1)

    # Update Load Dispatch status
    ld.db_set("status", "Received")

    # 🔹 Load Plan (if linked)
    if ld.linked_load_reference_no:
        frappe.db.set_value(
            "Load Plan",
            ld.linked_load_reference_no,
            "status",
            "Received"
        )


def on_cancel_purchase_receipt(doc, method=None):
    """
    Reset Load Dispatch & Load Plan when Purchase Receipt is cancelled
    """

    if not doc.custom_load_dispatch:
        return

    # 🔹 Load Dispatch
    ld = frappe.get_doc("Load Dispatch", doc.custom_load_dispatch)

    # Reset receipt quantity
    ld.db_set("total_receipt_quantity", 0)

    # Reset Load Dispatch status
    ld.db_set("status", "In-Transit")

    # 🔹 Load Plan (if linked)
    if ld.linked_load_reference_no:
        frappe.db.set_value(
            "Load Plan",
            ld.linked_load_reference_no,
            "status",
            "In-Transit"
        )
