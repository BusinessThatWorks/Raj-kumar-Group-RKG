# -*- coding: utf-8 -*-
import frappe


def on_submit_purchase_invoice(doc, method=None):
    """
    Update Load Dispatch & Load Plan when Purchase Invoice is submitted
    Assumption: 1 PI = 1 Load Dispatch
    """

    if not doc.custom_load_dispatch:
        return

    # 🔹 Load Dispatch
    ld = frappe.get_doc("Load Dispatch", doc.custom_load_dispatch)

    # Set billed quantity = 1
    ld.db_set("total_billed_quantity", 1)

    # (Optional) Update status if you use billing state
    # ld.db_set("status", "Billed")



def on_cancel_purchase_invoice(doc, method=None):
    """
    Reset Load Dispatch & Load Plan when Purchase Invoice is cancelled
    """

    if not doc.custom_load_dispatch:
        return

    # 🔹 Load Dispatch
    ld = frappe.get_doc("Load Dispatch", doc.custom_load_dispatch)

    # Reset billed quantity
    ld.db_set("total_billed_quantity", 0)

    # (Optional) Reset status
    # ld.db_set("status", "Received")

