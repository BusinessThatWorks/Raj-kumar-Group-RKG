frappe.ui.form.on('Frame Bundle', {

    refresh: function(frm) {
        // Optional: make end of life read only after save
        if (!frm.is_new()) {
            frm.set_df_property('item_end_of_life', 'read_only', 1);
        }
    },

    item_code: function(frm) {

        // -------------------------------------------------
        // Reset if item_code is cleared
        // -------------------------------------------------
        if (!frm.doc.item_code) {
            reset_fields(frm);
            return;
        }

        // =================================================
        // 1️⃣ Set Item End of Life = Today + 5 Years
        // =================================================
        let today = frappe.datetime.get_today();
        let end_date = frappe.datetime.add_years(today, 5);
        frm.set_value('item_end_of_life', end_date);

        // =================================================
        // 2️⃣ Fetch Default Warehouse from Item
        // =================================================
        frappe.db.get_value('Item', frm.doc.item_code, 'default_warehouse')
        .then(r => {
            if (r.message && r.message.default_warehouse) {
                frm.set_value('warehouse', r.message.default_warehouse);
            } else {
                frm.set_value('warehouse', '');
            }
        });

        // =================================================
        // 3️⃣ Fetch Battery Key Upload Item
        // =================================================
        frappe.db.get_list('Battery Key Upload Item', {
            filters: { item_code: frm.doc.item_code },
            fields: ['name', 'key_no', 'battery_serial_no'],
            limit: 1
        }).then(records => {

            if (!records || records.length === 0) {
                reset_battery_fields(frm);
                frappe.msgprint(__('No Battery Upload record found for this Item.'));
                return;
            }

            let row = records[0];

            frm.set_value('frame_no', row.name || '');
            frm.set_value('key_number', row.key_no || '');

            // =================================================
            // 4️⃣ Fetch Battery Information
            // =================================================
            if (row.battery_serial_no) {
                frappe.db.get_value(
                    'Battery Information',
                    { battery_serial_no: row.battery_serial_no },
                    'name'
                ).then(b => {
                    if (b.message) {
                        frm.set_value('battery_serial_no', b.message.name);
                    } else {
                        frm.set_value('battery_serial_no', '');
                    }
                });
            } else {
                frm.set_value('battery_serial_no', '');
            }

        });
    }

});


/* ============================================================
   HELPERS
   ============================================================ */

function reset_fields(frm) {
    frm.set_value('warehouse', '');
    frm.set_value('frame_no', '');
    frm.set_value('key_number', '');
    frm.set_value('battery_serial_no', '');
    frm.set_value('item_end_of_life', '');
}

function reset_battery_fields(frm) {
    frm.set_value('frame_no', '');
    frm.set_value('key_number', '');
    frm.set_value('battery_serial_no', '');
}
