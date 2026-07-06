// db.js — Shared Primo Invoice database layer
// Include this on every page: <script src="db.js"></script>
// Requires supabase client to already be initialised as window.supabase

var DB = {

  // ─── AUTO NUMBER ──────────────────────────────────────
  async getNextNumber(type) {
    // type: 'invoice' or 'quote'
    var table = type === 'quote' ? 'quotes' : 'invoices';
    var prefix = type === 'quote' ? 'Q' : '';
    var localKey = type === 'quote' ? 'pi_last_q_num' : 'pi_last_inv_num';
    var startFrom = type === 'quote' ? 1000 : 1000;

    try {
      var { data, error } = await supabase
        .from(table)
        .select('number')
        .order('created_at', { ascending: false })
        .limit(50);

      var maxNum = startFrom;
      if (!error && data && data.length > 0) {
        data.forEach(function(row) {
          if (!row.number) return;
          var match = row.number.toString().replace(/[^0-9]/g, '');
          if (match) { var n = parseInt(match); if (n > maxNum) maxNum = n; }
        });
      }
      var next = maxNum + 1;
      localStorage.setItem(localKey, next.toString());
      return prefix ? ('#' + prefix + next) : ('#' + next);
    } catch(e) {
      var last = parseInt(localStorage.getItem(localKey) || startFrom.toString());
      var next = last + 1;
      localStorage.setItem(localKey, next.toString());
      return prefix ? ('#' + prefix + next) : ('#' + next);
    }
  },

  // ─── CUSTOMERS ───────────────────────────────────────
  async getCustomers() {
    var { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    return error ? [] : data;
  },
  async saveCustomer(cust) {
    var { data: { user } } = await supabase.auth.getUser();
    var row = { user_id: user.id, name: cust.name, email: cust.email || null, phone: cust.phone || null, address: cust.address || null, postcode: cust.postcode || null, notes: cust.notes || null };
    if (cust.id && !cust.isNew) {
      var { data, error } = await supabase.from('customers').update(row).eq('id', cust.id).select().single();
      return error ? null : data;
    } else {
      var { data, error } = await supabase.from('customers').insert(row).select().single();
      return error ? null : data;
    }
  },
  async deleteCustomer(id) {
    var { error } = await supabase.from('customers').delete().eq('id', id);
    return !error;
  },
  async getCustomerWithHistory(id) {
    var { data: cust } = await supabase.from('customers').select('*').eq('id', id).single();
    var { data: invs } = await supabase.from('invoices').select('*').eq('customer_id', id).order('created_at', { ascending: false });
    var { data: jobs } = await supabase.from('jobs').select('*').eq('customer_id', id).order('created_at', { ascending: false });
    var total = (invs || []).filter(function(i){ return i.status === 'paid'; }).reduce(function(a,i){ return a + Number(i.amount); }, 0);
    return { ...cust, invoices: invs || [], jobs: jobs || [], totalSpent: total, invoiceCount: (invs||[]).length };
  },

  // ─── INVOICES ─────────────────────────────────────────
  async getInvoices() {
    var { data, error } = await supabase.from('invoices').select('*, customers(name, email, phone)').order('created_at', { ascending: false });
    return error ? [] : data;
  },
  async saveInvoice(inv) {
    var { data: { user } } = await supabase.auth.getUser();
    var row = {
      user_id: user.id,
      customer_id: inv.customer_id || null,
      number: inv.number || null,
      customer_name: inv.customer_name || inv.customer || null,
      job: inv.job || null,
      amount: Number(inv.amount) || 0,
      vat_amount: Number(inv.vat_amount) || 0,
      status: inv.status || 'unpaid',
      payment_method: inv.payment_method || null,
      partial_amount: inv.partial_amount ? Number(inv.partial_amount) : null,
      stripe_payment_link: inv.stripe_payment_link || null,
      date: inv.date || new Date().toISOString().split('T')[0],
      due_date: inv.due_date || null,
      notes: inv.notes || null
    };
    if (inv.id) {
      var { data, error } = await supabase.from('invoices').update(row).eq('id', inv.id).select().single();
      return error ? null : data;
    } else {
      var { data, error } = await supabase.from('invoices').insert(row).select().single();
      return error ? null : data;
    }
  },
  async updateInvoiceStatus(id, status, method, partialAmount) {
    var { data, error } = await supabase.from('invoices').update({
      status: status,
      payment_method: method || null,
      partial_amount: partialAmount ? Number(partialAmount) : null
    }).eq('id', id).select().single();
    return error ? null : data;
  },
  async deleteInvoice(id) {
    var { error } = await supabase.from('invoices').delete().eq('id', id);
    return !error;
  },

  // ─── QUOTES ───────────────────────────────────────────
  async getQuotes() {
    var { data, error } = await supabase.from('quotes').select('*').order('created_at', { ascending: false });
    return error ? [] : data;
  },
  async saveQuote(q) {
    var { data: { user } } = await supabase.auth.getUser();
    var row = { user_id: user.id, customer_id: q.customer_id || null, number: q.number || null, customer_name: q.customer_name || null, job: q.job || null, amount: Number(q.amount) || 0, status: q.status || 'draft', date: q.date || new Date().toISOString().split('T')[0], notes: q.notes || null };
    if (q.id) {
      var { data, error } = await supabase.from('quotes').update(row).eq('id', q.id).select().single();
      return error ? null : data;
    } else {
      var { data, error } = await supabase.from('quotes').insert(row).select().single();
      return error ? null : data;
    }
  },
  async updateQuoteStatus(id, status) {
    var { data, error } = await supabase.from('quotes').update({ status }).eq('id', id).select().single();
    return error ? null : data;
  },

  // ─── JOBS ─────────────────────────────────────────────
  async getJobs() {
    var { data, error } = await supabase.from('jobs').select('*').order('created_at', { ascending: false });
    return error ? [] : data;
  },
  async saveJob(job) {
    var { data: { user } } = await supabase.auth.getUser();
    var row = { user_id: user.id, customer_id: job.customer_id || null, customer_name: job.customer || job.customer_name || null, title: job.title, notes: job.notes || null, date: job.date || null, time: job.time || null, status: job.status || 'todo', priority: job.priority || 'normal', reminder: job.reminder !== false, payment_status: job.payment_status || 'unpaid', payment_method: job.payment_method || null, partial_amount: job.partial_amount ? Number(job.partial_amount) : null };
    if (job.id && !job.isNew) {
      var { data, error } = await supabase.from('jobs').update(row).eq('id', job.id).select().single();
      return error ? null : data;
    } else {
      var { data, error } = await supabase.from('jobs').insert(row).select().single();
      return error ? null : data;
    }
  },
  async updateJobPayment(id, status, method, partialAmount) {
    var { data, error } = await supabase.from('jobs').update({
      payment_status: status,
      payment_method: method || null,
      partial_amount: partialAmount ? Number(partialAmount) : null
    }).eq('id', id).select().single();
    return error ? null : data;
  },
  async updateJobStatus(id, status) {
    var { data, error } = await supabase.from('jobs').update({ status }).eq('id', id).select().single();
    return error ? null : data;
  },
  async deleteJob(id) {
    var { error } = await supabase.from('jobs').delete().eq('id', id);
    return !error;
  },

  // ─── EARNINGS SUMMARY ─────────────────────────────────
  async getEarningsSummary(from, to) {
    var query = supabase.from('invoices').select('*');
    if (from) query = query.gte('date', from);
    if (to)   query = query.lte('date', to);
    var { data, error } = await query;
    if (error) return { earned: 0, outstanding: 0, invoices: [], count: 0 };
    var earned      = data.filter(function(i){ return i.status === 'paid' || i.status === 'partial'; }).reduce(function(a,i){ return a + Number(i.amount); }, 0);
    var outstanding = data.filter(function(i){ return i.status === 'unpaid' || i.status === 'overdue'; }).reduce(function(a,i){ return a + Number(i.amount); }, 0);
    return { earned, outstanding, invoices: data, count: data.length };
  }
};
