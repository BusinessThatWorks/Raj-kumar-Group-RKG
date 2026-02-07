from frappe import _


def get_data():
    return {
        "fieldname": "custom_load_dispatch",
        "transactions": [
            {
                "label": _("Purchase Receipt"),
                "items": [
                    "Purchase Receipt"
                ],
            }
        ],
    }
