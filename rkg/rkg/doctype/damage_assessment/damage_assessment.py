# -*- coding: utf-8 -*-
import frappe
from frappe.model.document import Document


class DamageAssessment(Document):

    def validate(self):
        self.update_load_dispatch_frame_counts()

    def on_trash(self):
        # Recalculate when a Damage Assessment is deleted
        self.update_load_dispatch_frame_counts(force=True)

    def update_load_dispatch_frame_counts(self, force=False):
        """
        Update OK / Not OK frame counts in linked Load Dispatch.
        Counts are DB-authoritative (not form-based).
        """

        if not self.load_dispatch:
            return

        if not frappe.db.exists("Load Dispatch", self.load_dispatch):
            return

        # ------------------------------------------------
        # 1️⃣ Get ALL Damage Assessments for this Load Dispatch
        # ------------------------------------------------
        da_names = frappe.get_all(
            "Damage Assessment",
            filters={"load_dispatch": self.load_dispatch},
            pluck="name"
        )

        # ------------------------------------------------
        # 2️⃣ If no assessments exist → reset counts
        # ------------------------------------------------
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
        # 3️⃣ Count NOT OK frames (DB-level)
        # ------------------------------------------------
        not_ok_count = frappe.db.count(
            "Damage Assessment Item",
            filters={
                "parent": ["in", da_names],
                "parenttype": "Damage Assessment",
                "status": "Not OK"
            }
        )

        # ------------------------------------------------
        # 4️⃣ Count OK frames (DB-level)
        # ------------------------------------------------
        ok_count = frappe.db.count(
            "Damage Assessment Item",
            filters={
                "parent": ["in", da_names],
                "parenttype": "Damage Assessment",
                "status": "OK"
            }
        )

        # ------------------------------------------------
        # 5️⃣ Update Load Dispatch
        # ------------------------------------------------
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
# API: Frames available for Damage Assessment
# ============================================================

@frappe.whitelist()
def get_items_from_load_dispatch(load_dispatch):
    """
    Return frame numbers from Load Dispatch
    EXCLUDING frames already marked NOT OK
    across ALL Damage Assessments.
    """

    if not frappe.db.exists("Load Dispatch", load_dispatch):
        frappe.throw("Invalid Load Dispatch")

    ld = frappe.get_doc("Load Dispatch", load_dispatch)

    # ------------------------------------------------
    # 1️⃣ Get all Damage Assessments for this Load Dispatch
    # ------------------------------------------------
    da_names = frappe.get_all(
        "Damage Assessment",
        filters={"load_dispatch": load_dispatch},
        pluck="name"
    )

    # ------------------------------------------------
    # 2️⃣ Get NOT OK frames (DB-authoritative)
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
    # 3️⃣ Return only AVAILABLE frames
    # ------------------------------------------------
    items = []
    for row in ld.items:
        if row.item_code not in not_ok_frames:
            items.append({
                "frame_no": row.item_code
            })

    return {
        "load_reference_number": ld.linked_load_reference_no,
        "items": items
    }
