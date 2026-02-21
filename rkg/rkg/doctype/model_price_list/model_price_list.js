frappe.ui.form.on('Model Price List', {

    onload: function(frm) {
        set_zero_values(frm);
        calculate_all(frm);
    },

    refresh: function(frm) {
        set_zero_values(frm);
        calculate_all(frm);
    },

    ex_showroom: calculate_all,
    registration: calculate_all,
    insurance: calculate_all,
    extended_warranty: calculate_all,
    nd_accessories: calculate_all
});

function set_zero_values(frm) {
    frm.set_value("on_road_basic", frm.doc.on_road_basic || 0);
    frm.set_value("on_road_with_ew", frm.doc.on_road_with_ew || 0);
    frm.set_value("on_road_with_nd", frm.doc.on_road_with_nd || 0);
}

function calculate_all(frm) {

    let ex  = frm.doc.ex_showroom || 0;
    let reg = frm.doc.registration || 0;
    let ins = frm.doc.insurance || 0;
    let ew  = frm.doc.extended_warranty || 0;
    let nd  = frm.doc.nd_accessories || 0;

    // ✅ 1 + 2 + 3 (ALL must be present)
    let basic = 0;
    if (ex && reg && ins) {
        basic = ex + reg + ins;
    }

    // ✅ 1 + 2 + 3 + 4 (ALL must be present)
    let with_ew = 0;
    if (ex && reg && ins && ew) {
        with_ew = ex + reg + ins + ew;
    }

    // ✅ 1 + 2 + 4 + 5 (ALL must be present)
    let with_nd = 0;
    if (ex && reg && ew && nd) {
        with_nd = ex + reg + ew + nd;
    }

    frm.set_value("on_road_basic", basic);
    frm.set_value("on_road_with_ew", with_ew);
    frm.set_value("on_road_with_nd", with_nd);
}