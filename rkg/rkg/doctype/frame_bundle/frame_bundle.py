# Copyright (c) 2026
# License: see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import add_years, today


class FrameBundle(Document):

    # =========================================================
    # SERVER SIDE VALIDATION
    # =========================================================
    def validate(self):

        # ---------------------------------------------
        # 0️⃣ Prevent Duplicate Frame No
        # ---------------------------------------------
        if self.frame_no:
            existing = frappe.db.exists(
                "Frame Bundle",
                {
                    "frame_no": self.frame_no,
                    "name": ["!=", self.name]   # exclude current doc (edit case)
                }
            )

            if existing:
                frappe.throw("This frame number already set key number")

        # ---------------------------------------------
        # 1️⃣ Fetch Default Warehouse from Item
        # ---------------------------------------------
        if self.item_code:

            default_warehouse = frappe.db.get_value(
                "Item",
                self.item_code,
                "default_warehouse"
            )

            if default_warehouse:
                self.warehouse = default_warehouse

        # ---------------------------------------------
        # 2️⃣ Fetch Battery Key Upload Item
        # ---------------------------------------------
        if self.item_code:

            battery_upload = frappe.db.get_value(
                "Battery Key Upload Item",
                {"item_code": self.item_code},
                ["name", "key_no", "battery_serial_no"],
                as_dict=True
            )

            if battery_upload:

                self.frame_no = battery_upload.name
                self.key_number = battery_upload.key_no

                # -----------------------------------------
                # 3️⃣ Fetch Battery Information
                # -----------------------------------------
                battery_info_name = frappe.db.get_value(
                    "Battery Information",
                    {"battery_serial_no": battery_upload.battery_serial_no},
                    "name"
                )

                if battery_info_name:
                    self.battery_serial_no = battery_info_name

        # ---------------------------------------------
        # 4️⃣ Set Item End of Life = Today + 5 Years
        # ---------------------------------------------
        if not self.item_end_of_life:
            self.item_end_of_life = add_years(today(), 5)
