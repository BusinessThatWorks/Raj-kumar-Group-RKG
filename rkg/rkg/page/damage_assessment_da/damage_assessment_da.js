frappe.pages['damage-assessment-da'].on_page_load = function (wrapper) {

    // =====================================================
    // PAGE HEADER (MATCH DESK STYLE)
    // =====================================================
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Damage Assessment',
        single_column: true
    });

    const $page = $(page.body);

    // =====================================================
    // EMBEDDED CSS (INSIDE JS)
    // =====================================================
    const style = `
        <style>
            .da-container {
                padding: 16px 24px;
            }

            .da-filters label {
                font-size: 13px;
                color: #6b7280;
                font-weight: 500;
            }

            .da-card {
                display: flex;
                background: #fff;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                overflow: hidden;
            }

            .da-card-bar {
                width: 4px;
                background: #2563eb;
            }

            .da-card h3 {
                margin: 0;
                font-size: 22px;
                font-weight: 600;
            }

            .da-card .text-muted {
                font-size: 13px;
            }

            .table thead th {
                background: #f9fafb;
                font-weight: 600;
                border-bottom: 1px solid #e5e7eb;
            }

            .table td, .table th {
                vertical-align: middle;
                font-size: 13px;
            }

            .btn-reset {
                border: 1px solid #d1d5db;
                background: #f9fafb;
            }
        </style>
    `;

    // =====================================================
    // FILTERS
    // =====================================================
    const filters_html = `
        <div class="da-container da-filters">
            <div class="row g-3 align-items-end">

                <div class="col-md-3">
                    <label>Load Dispatch</label>
                    <select class="form-control" id="load_dispatch">
                        <option value="">All Load Dispatches</option>
                    </select>
                </div>

                <div class="col-md-3">
                    <label>Status</label>
                    <select class="form-control" id="status">
                        <option value="">All Status</option>
                        <option value="OK">OK</option>
                        <option value="Not OK">Not OK</option>
                    </select>
                </div>

                <div class="col-md-3">
                    <label>Warehouse</label>
                    <select class="form-control" id="warehouse">
                        <option value="">All Warehouses</option>
                    </select>
                </div>

                <div class="col-md-3">
                    <button class="btn btn-reset w-100" id="clear">
                        Reset Filters
                    </button>
                </div>

            </div>
        </div>
    `;

    // =====================================================
    // SUMMARY CARDS
    // =====================================================
    const cards_html = `
        <div class="da-container">
            <div class="row g-3">

                <div class="col-md-4">
                    <div class="da-card">
                        <div class="da-card-bar"></div>
                        <div class="p-3">
                            <div class="text-muted">Total Frames</div>
                            <h3 id="total_frames">0</h3>
                        </div>
                    </div>
                </div>

                <div class="col-md-4">
                    <div class="da-card">
                        <div class="da-card-bar"></div>
                        <div class="p-3">
                            <div class="text-muted">Damaged Frames</div>
                            <h3 id="damaged_frames">0</h3>
                        </div>
                    </div>
                </div>

                <div class="col-md-4">
                    <div class="da-card">
                        <div class="da-card-bar"></div>
                        <div class="p-3">
                            <div class="text-muted">Total Estimated Cost</div>
                            <h3 id="total_cost">₹ 0.00</h3>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    `;

    // =====================================================
    // TABLE
    // =====================================================
    const table_html = `
        <div class="da-container">
            <div class="card">
                <div class="card-body">
                    <h5 class="mb-3">Frames Assessment</h5>

                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Frame No</th>
                                <th>Status</th>
                                <th>Load Dispatch</th>
                                <th>Load Ref No</th>
                                <th>Warehouse</th>
                                <th>Issues</th>
                                <th>Est. Amount</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody id="frames_table">
                            <tr>
                                <td colspan="8" class="text-center text-muted">
                                    Loading...
                                </td>
                            </tr>
                        </tbody>
                    </table>

                </div>
            </div>
        </div>
    `;

    // =====================================================
    // RENDER
    // =====================================================
    $page.html(style + filters_html + cards_html + table_html);

    // =====================================================
    // INIT
    // =====================================================
    load_filters();
    load_data();

    // AUTO REFRESH ON FILTER CHANGE
    $('#load_dispatch, #status, #warehouse').on('change', load_data);

    $('#clear').on('click', function () {
        $('#load_dispatch, #status, #warehouse').val('');
        load_data();
    });

    // =====================================================
    // FILTER OPTIONS
    // =====================================================
    function load_filters() {
        frappe.call({
            method: "rkg.rkg.page.damage_assessment_da.damage_assessment_da.get_filters",
            callback(r) {
                if (!r.message) return;

                r.message.load_dispatches.forEach(d =>
                    $('#load_dispatch').append(`<option value="${d}">${d}</option>`)
                );

                r.message.warehouses.forEach(w =>
                    $('#warehouse').append(`<option value="${w}">${w}</option>`)
                );
            }
        });
    }

    // =====================================================
    // LOAD DATA
    // =====================================================
    function load_data() {
        frappe.call({
            method: "rkg.rkg.page.damage_assessment_da.damage_assessment_da.get_dashboard_data",
            args: {
                load_dispatch: $('#load_dispatch').val(),
                status: $('#status').val(),
                warehouse: $('#warehouse').val()
            },
            callback(r) {
                if (!r.message) return;

                const d = r.message;

                $('#total_frames').text(d.total_frames || 0);
                $('#damaged_frames').text(d.damaged_frames || 0);
                $('#total_cost').text(`₹ ${flt(d.total_cost).toFixed(2)}`);

                let rows = '';

                if (!d.rows.length) {
                    rows = `<tr><td colspan="8" class="text-center text-muted">No records found</td></tr>`;
                } else {
                    d.rows.forEach(r => {
                        rows += `
                            <tr>
                                <td>${r.frame_no}</td>
                                <td>${r.status}</td>
                                <td>${r.load_dispatch || ''}</td>
                                <td>${r.load_reference_number || ''}</td>
                                <td>${r.warehouse || ''}</td>
                                <td>${r.issues || ''}</td>
                                <td>₹ ${flt(r.estimated_amount).toFixed(2)}</td>
                                <td>${frappe.datetime.str_to_user(r.date)}</td>
                            </tr>
                        `;
                    });
                }

                $('#frames_table').html(rows);
            }
        });
    }
};
