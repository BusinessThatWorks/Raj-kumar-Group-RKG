# -*- coding: utf-8 -*-
import frappe
from frappe.model.document import Document


class DamageAssessment(Document):

    def validate(self):
        self.update_load_dispatch_frame_counts()

    def on_trash(self):
        self.update_load_dispatch_frame_counts(force=True)

    def update_load_dispatch_frame_counts(self, force=False):
        """
        Update OK / Not OK frame counts in linked Load Dispatch.
        DB authoritative.
        """

        if not self.load_dispatch:
            return

        if not frappe.db.exists("Load Dispatch", self.load_dispatch):
            return

        # ------------------------------------------------
        # Get all Damage Assessments for this Load Dispatch
        # ------------------------------------------------
        da_names = frappe.get_all(
            "Damage Assessment",
            filters={"load_dispatch": self.load_dispatch},
            pluck="name"
        )

        if not da_names:
            frappe.db.set_value(
                "Load Dispatch",
                self.load_dispatch,
                {
                    "frames_ok": 0,
                    "frames_not_ok": 0
                },
                update_modified=False
            )
            return

        # ------------------------------------------------
        # Count frames
        # ------------------------------------------------
        not_ok_count = frappe.db.count(
            "Damage Assessment Item",
            filters={
                "parent": ["in", da_names],
                "parenttype": "Damage Assessment",
                "status": "Not OK"
            }
        )

        ok_count = frappe.db.count(
            "Damage Assessment Item",
            filters={
                "parent": ["in", da_names],
                "parenttype": "Damage Assessment",
                "status": "OK"
            }
        )

        frappe.db.set_value(
            "Load Dispatch",
            self.load_dispatch,
            {
                "frames_ok": ok_count,
                "frames_not_ok": not_ok_count
            },
            update_modified=False
        )


# ============================================================
# API: Frames + Accepted Warehouse from PR
# ============================================================

@frappe.whitelist()
def get_items_from_load_dispatch(load_dispatch):
    """
    Return:
    - Available frames (excluding Not OK)
    - Load Reference Number
    - Accepted Warehouse from Purchase Receipt
    """

    if not frappe.db.exists("Load Dispatch", load_dispatch):
        frappe.throw("Invalid Load Dispatch")

    ld = frappe.get_doc("Load Dispatch", load_dispatch)

    # ------------------------------------------------
    # Accepted Warehouse from Purchase Receipt
    # ------------------------------------------------
    accepted_warehouse = frappe.db.get_value(
        "Purchase Receipt",
        {
            "custom_load_dispatch": load_dispatch,
            "docstatus": 1
        },
        "set_warehouse"
    )

    # ------------------------------------------------
    # Get all Damage Assessments for this Load Dispatch
    # ------------------------------------------------
    da_names = frappe.get_all(
        "Damage Assessment",
        filters={"load_dispatch": load_dispatch},
        pluck="name"
    )

    # ------------------------------------------------
    # Frames already marked NOT OK
    # ------------------------------------------------
    not_ok_frames = set()

    if da_names:
        not_ok_frames = set(
            frappe.get_all(
                "Damage Assessment Item",
                filters={
                    "parent": ["in", da_names],
                    "parenttype": "Damage Assessment",
                    "status": "Not OK"
                },
                pluck="frame_no"
            )
        )

    # ------------------------------------------------
    # Available frames
    # ------------------------------------------------
    items = []
    for row in ld.items:
        if row.item_code not in not_ok_frames:
            items.append({
                "frame_no": row.item_code
            })

    return {
        "load_reference_number": ld.linked_load_reference_no,
        "accepted_warehouse": accepted_warehouse,
        "items": items
    }
