# -*- coding: utf-8 -*-
import frappe


def get_load_dispatch_from_pi(doc):
    """
    Fetch Load Dispatch using Purchase Receipt linked in PI items
    """
    for item in doc.items:
        if item.purchase_receipt:
            return frappe.db.get_value(
                "Purchase Receipt",
                item.purchase_receipt,
                "custom_load_dispatch"
            )
    return None


def on_submit_purchase_invoice(doc, method=None):
    """
    Update Load Dispatch when Purchase Invoice is submitted
    """

    load_dispatch = get_load_dispatch_from_pi(doc)
    if not load_dispatch:
        return

    ld = frappe.get_doc("Load Dispatch", load_dispatch)

    # 1️⃣ Mark billed
    ld.db_set("total_billed_quantity", 1)


def on_cancel_purchase_invoice(doc, method=None):
    """
    Reset Load Dispatch when Purchase Invoice is cancelled
    """

    load_dispatch = get_load_dispatch_from_pi(doc)
    if not load_dispatch:
        return

    ld = frappe.get_doc("Load Dispatch", load_dispatch)

    # 2️⃣ Reset billed
    ld.db_set("total_billed_quantity", 0)
