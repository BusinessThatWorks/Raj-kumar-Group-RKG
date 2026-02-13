frappe.ui.form.on('Frame Bundle', {

    refresh: function(frm) {

        // Make important fields read-only after save
        if (!frm.is_new()) {
            frm.set_df_property('item_code', 'read_only', 1);
            frm.set_df_property('frame_no', 'read_only', 1);
            frm.set_df_property('battery_serial_no', 'read_only', 1);
        }
    }

});
