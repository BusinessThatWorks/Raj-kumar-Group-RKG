# Copyright (c) 2026
# License: see license.txt

import frappe
from frappe.model.document import Document


class FrameBundle(Document):

    def validate(self):

        # Prevent duplicate frame_no
        if self.frame_no:
            existing = frappe.db.exists(
                "Frame Bundle",
                {
                    "frame_no": self.frame_no,
                    "name": ["!=", self.name]
                }
            )

            if existing:
                frappe.throw("Frame No already linked with another Key Number.")

        # Prevent duplicate battery serial
        if self.battery_serial_no:
            existing_battery = frappe.db.exists(
                "Frame Bundle",
                {
                    "battery_serial_no": self.battery_serial_no,
                    "name": ["!=", self.name]
                }
            )

            if existing_battery:
                frappe.throw("Battery Serial No already used in another Frame Bundle.")
