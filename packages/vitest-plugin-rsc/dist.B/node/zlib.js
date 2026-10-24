import { Transform } from "node:stream";
import { Buffer as Buffer$1 } from "vitest-plugin-rsc/node/buffer";
//#region ../../node_modules/.pnpm/fflate@0.8.3/node_modules/fflate/esm/browser.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	1,
	1,
	1,
	1,
	2,
	2,
	2,
	2,
	3,
	3,
	3,
	3,
	4,
	4,
	4,
	4,
	5,
	5,
	5,
	5,
	0,
	0,
	0,
	0
]);
var fdeb = new u8([
	0,
	0,
	0,
	0,
	1,
	1,
	2,
	2,
	3,
	3,
	4,
	4,
	5,
	5,
	6,
	6,
	7,
	7,
	8,
	8,
	9,
	9,
	10,
	10,
	11,
	11,
	12,
	12,
	13,
	13,
	0,
	0
]);
var clim = new u8([
	16,
	17,
	18,
	0,
	8,
	7,
	9,
	6,
	10,
	5,
	11,
	4,
	12,
	3,
	13,
	2,
	14,
	1,
	15
]);
var freb = function(eb, start) {
	var b = new u16(31);
	for (var i = 0; i < 31; ++i) b[i] = start += 1 << eb[i - 1];
	var r = new i32(b[30]);
	for (var i = 1; i < 30; ++i) for (var j = b[i]; j < b[i + 1]; ++j) r[j] = j - b[i] << 5 | i;
	return {
		b,
		r
	};
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
	var x = (i & 43690) >> 1 | (i & 21845) << 1;
	x = (x & 52428) >> 2 | (x & 13107) << 2;
	x = (x & 61680) >> 4 | (x & 3855) << 4;
	rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var hMap = (function(cd, mb, r) {
	var s = cd.length;
	var i = 0;
	var l = new u16(mb);
	for (; i < s; ++i) if (cd[i]) ++l[cd[i] - 1];
	var le = new u16(mb);
	for (i = 1; i < mb; ++i) le[i] = le[i - 1] + l[i - 1] << 1;
	var co;
	if (r) {
		co = new u16(1 << mb);
		var rvb = 15 - mb;
		for (i = 0; i < s; ++i) if (cd[i]) {
			var sv = i << 4 | cd[i];
			var r_1 = mb - cd[i];
			var v = le[cd[i] - 1]++ << r_1;
			for (var m = v | (1 << r_1) - 1; v <= m; ++v) co[rev[v] >> rvb] = sv;
		}
	} else {
		co = new u16(s);
		for (i = 0; i < s; ++i) if (cd[i]) co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
	}
	return co;
});
var flt = new u8(288);
for (var i = 0; i < 144; ++i) flt[i] = 8;
for (var i = 144; i < 256; ++i) flt[i] = 9;
for (var i = 256; i < 280; ++i) flt[i] = 7;
for (var i = 280; i < 288; ++i) flt[i] = 8;
var fdt = new u8(32);
for (var i = 0; i < 32; ++i) fdt[i] = 5;
var flm = /*#__PURE__*/ hMap(flt, 9, 0);
var flrm = /*#__PURE__*/ hMap(flt, 9, 1);
var fdm = /*#__PURE__*/ hMap(fdt, 5, 0);
var fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
var max = function(a) {
	var m = a[0];
	for (var i = 1; i < a.length; ++i) if (a[i] > m) m = a[i];
	return m;
};
var bits = function(d, p, m) {
	var o = p / 8 | 0;
	return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
	var o = p / 8 | 0;
	return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
	return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
	if (s == null || s < 0) s = 0;
	if (e == null || e > v.length) e = v.length;
	return new u8(v.subarray(s, e));
};
var ec = [
	"unexpected EOF",
	"invalid block type",
	"invalid length/literal",
	"invalid distance",
	"stream finished",
	"no stream handler",
	,
	"no callback",
	"invalid UTF-8 data",
	"extra field too long",
	"date not in range 1980-2099",
	"filename too long",
	"stream finishing",
	"invalid zip data"
];
var err = function(ind, msg, nt) {
	var e = new Error(msg || ec[ind]);
	e.code = ind;
	if (Error.captureStackTrace) Error.captureStackTrace(e, err);
	if (!nt) throw e;
	return e;
};
var inflt = function(dat, st, buf, dict) {
	var sl = dat.length, dl = dict ? dict.length : 0;
	if (!sl || st.f && !st.l) return buf || new u8(0);
	var noBuf = !buf;
	var resize = noBuf || st.i != 2;
	var noSt = st.i;
	if (noBuf) buf = new u8(sl * 3);
	var cbuf = function(l) {
		var bl = buf.length;
		if (l > bl) {
			var nbuf = new u8(Math.max(bl * 2, l));
			nbuf.set(buf);
			buf = nbuf;
		}
	};
	var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
	var tbts = sl * 8;
	do {
		if (!lm) {
			final = bits(dat, pos, 1);
			var type = bits(dat, pos + 1, 3);
			pos += 3;
			if (!type) {
				var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
				if (t > sl) {
					if (noSt) err(0);
					break;
				}
				if (resize) cbuf(bt + l);
				buf.set(dat.subarray(s, t), bt);
				st.b = bt += l, st.p = pos = t * 8, st.f = final;
				continue;
			} else if (type == 1) lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
			else if (type == 2) {
				var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
				var tl = hLit + bits(dat, pos + 5, 31) + 1;
				pos += 14;
				var ldt = new u8(tl);
				var clt = new u8(19);
				for (var i = 0; i < hcLen; ++i) clt[clim[i]] = bits(dat, pos + i * 3, 7);
				pos += hcLen * 3;
				var clb = max(clt), clbmsk = (1 << clb) - 1;
				var clm = hMap(clt, clb, 1);
				for (var i = 0; i < tl;) {
					var r = clm[bits(dat, pos, clbmsk)];
					pos += r & 15;
					var s = r >> 4;
					if (s < 16) ldt[i++] = s;
					else {
						var c = 0, n = 0;
						if (s == 16) n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
						else if (s == 17) n = 3 + bits(dat, pos, 7), pos += 3;
						else if (s == 18) n = 11 + bits(dat, pos, 127), pos += 7;
						while (n--) ldt[i++] = c;
					}
				}
				var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
				lbt = max(lt);
				dbt = max(dt);
				lm = hMap(lt, lbt, 1);
				dm = hMap(dt, dbt, 1);
			} else err(1);
			if (pos > tbts) {
				if (noSt) err(0);
				break;
			}
		}
		if (resize) cbuf(bt + 131072);
		var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
		var lpos = pos;
		for (;; lpos = pos) {
			var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
			pos += c & 15;
			if (pos > tbts) {
				if (noSt) err(0);
				break;
			}
			if (!c) err(2);
			if (sym < 256) buf[bt++] = sym;
			else if (sym == 256) {
				lpos = pos, lm = null;
				break;
			} else {
				var add = sym - 254;
				if (sym > 264) {
					var i = sym - 257, b = fleb[i];
					add = bits(dat, pos, (1 << b) - 1) + fl[i];
					pos += b;
				}
				var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
				if (!d) err(3);
				pos += d & 15;
				var dt = fd[dsym];
				if (dsym > 3) {
					var b = fdeb[dsym];
					dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
				}
				if (pos > tbts) {
					if (noSt) err(0);
					break;
				}
				if (resize) cbuf(bt + 131072);
				var end = bt + add;
				if (bt < dt) {
					var shift = dl - dt, dend = Math.min(dt, end);
					if (shift + bt < 0) err(3);
					for (; bt < dend; ++bt) buf[bt] = dict[shift + bt];
				}
				for (; bt < end; ++bt) buf[bt] = buf[bt - dt];
			}
		}
		st.l = lm, st.p = lpos, st.b = bt, st.f = final;
		if (lm) final = 1, st.m = lbt, st.d = dm, st.n = dbt;
	} while (!final);
	return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var wbits = function(d, p, v) {
	v <<= p & 7;
	var o = p / 8 | 0;
	d[o] |= v;
	d[o + 1] |= v >> 8;
};
var wbits16 = function(d, p, v) {
	v <<= p & 7;
	var o = p / 8 | 0;
	d[o] |= v;
	d[o + 1] |= v >> 8;
	d[o + 2] |= v >> 16;
};
var hTree = function(d, mb) {
	var t = [];
	for (var i = 0; i < d.length; ++i) if (d[i]) t.push({
		s: i,
		f: d[i]
	});
	var s = t.length;
	var t2 = t.slice();
	if (!s) return {
		t: et,
		l: 0
	};
	if (s == 1) {
		var v = new u8(t[0].s + 1);
		v[t[0].s] = 1;
		return {
			t: v,
			l: 1
		};
	}
	t.sort(function(a, b) {
		return a.f - b.f;
	});
	t.push({
		s: -1,
		f: 25001
	});
	var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
	t[0] = {
		s: -1,
		f: l.f + r.f,
		l,
		r
	};
	while (i1 != s - 1) {
		l = t[t[i0].f < t[i2].f ? i0++ : i2++];
		r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
		t[i1++] = {
			s: -1,
			f: l.f + r.f,
			l,
			r
		};
	}
	var maxSym = t2[0].s;
	for (var i = 1; i < s; ++i) if (t2[i].s > maxSym) maxSym = t2[i].s;
	var tr = new u16(maxSym + 1);
	var mbt = ln(t[i1 - 1], tr, 0);
	if (mbt > mb) {
		var i = 0, dt = 0;
		var lft = mbt - mb, cst = 1 << lft;
		t2.sort(function(a, b) {
			return tr[b.s] - tr[a.s] || a.f - b.f;
		});
		for (; i < s; ++i) {
			var i2_1 = t2[i].s;
			if (tr[i2_1] > mb) {
				dt += cst - (1 << mbt - tr[i2_1]);
				tr[i2_1] = mb;
			} else break;
		}
		dt >>= lft;
		while (dt > 0) {
			var i2_2 = t2[i].s;
			if (tr[i2_2] < mb) dt -= 1 << mb - tr[i2_2]++ - 1;
			else ++i;
		}
		for (; i >= 0 && dt; --i) {
			var i2_3 = t2[i].s;
			if (tr[i2_3] == mb) {
				--tr[i2_3];
				++dt;
			}
		}
		mbt = mb;
	}
	return {
		t: new u8(tr),
		l: mbt
	};
};
var ln = function(n, l, d) {
	return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
};
var lc = function(c) {
	var s = c.length;
	while (s && !c[--s]);
	var cl = new u16(++s);
	var cli = 0, cln = c[0], cls = 1;
	var w = function(v) {
		cl[cli++] = v;
	};
	for (var i = 1; i <= s; ++i) if (c[i] == cln && i != s) ++cls;
	else {
		if (!cln && cls > 2) {
			for (; cls > 138; cls -= 138) w(32754);
			if (cls > 2) {
				w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
				cls = 0;
			}
		} else if (cls > 3) {
			w(cln), --cls;
			for (; cls > 6; cls -= 6) w(8304);
			if (cls > 2) w(cls - 3 << 5 | 8208), cls = 0;
		}
		while (cls--) w(cln);
		cls = 1;
		cln = c[i];
	}
	return {
		c: cl.subarray(0, cli),
		n: s
	};
};
var clen = function(cf, cl) {
	var l = 0;
	for (var i = 0; i < cl.length; ++i) l += cf[i] * cl[i];
	return l;
};
var wfblk = function(out, pos, dat) {
	var s = dat.length;
	var o = shft(pos + 2);
	out[o] = s & 255;
	out[o + 1] = s >> 8;
	out[o + 2] = out[o] ^ 255;
	out[o + 3] = out[o + 1] ^ 255;
	for (var i = 0; i < s; ++i) out[o + i + 4] = dat[i];
	return (o + 4 + s) * 8;
};
var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
	wbits(out, p++, final);
	++lf[256];
	var _a = hTree(lf, 15), dlt = _a.t, mlb = _a.l;
	var _b = hTree(df, 15), ddt = _b.t, mdb = _b.l;
	var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
	var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
	var lcfreq = new u16(19);
	for (var i = 0; i < lclt.length; ++i) ++lcfreq[lclt[i] & 31];
	for (var i = 0; i < lcdt.length; ++i) ++lcfreq[lcdt[i] & 31];
	var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
	var nlcc = 19;
	for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc);
	var flen = bl + 5 << 3;
	var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
	var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
	if (bs >= 0 && flen <= ftlen && flen <= dtlen) return wfblk(out, p, dat.subarray(bs, bs + bl));
	var lm, ll, dm, dl;
	wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
	if (dtlen < ftlen) {
		lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
		var llm = hMap(lct, mlcb, 0);
		wbits(out, p, nlc - 257);
		wbits(out, p + 5, ndc - 1);
		wbits(out, p + 10, nlcc - 4);
		p += 14;
		for (var i = 0; i < nlcc; ++i) wbits(out, p + 3 * i, lct[clim[i]]);
		p += 3 * nlcc;
		var lcts = [lclt, lcdt];
		for (var it = 0; it < 2; ++it) {
			var clct = lcts[it];
			for (var i = 0; i < clct.length; ++i) {
				var len = clct[i] & 31;
				wbits(out, p, llm[len]), p += lct[len];
				if (len > 15) wbits(out, p, clct[i] >> 5 & 127), p += clct[i] >> 12;
			}
		}
	} else lm = flm, ll = flt, dm = fdm, dl = fdt;
	for (var i = 0; i < li; ++i) {
		var sym = syms[i];
		if (sym > 255) {
			var len = sym >> 18 & 31;
			wbits16(out, p, lm[len + 257]), p += ll[len + 257];
			if (len > 7) wbits(out, p, sym >> 23 & 31), p += fleb[len];
			var dst = sym & 31;
			wbits16(out, p, dm[dst]), p += dl[dst];
			if (dst > 3) wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
		} else wbits16(out, p, lm[sym]), p += ll[sym];
	}
	wbits16(out, p, lm[256]);
	return p + ll[256];
};
var deo = /*#__PURE__*/ new i32([
	65540,
	131080,
	131088,
	131104,
	262176,
	1048704,
	1048832,
	2114560,
	2117632
]);
var et = /*#__PURE__*/ new u8(0);
var dflt = function(dat, lvl, plvl, pre, post, st) {
	var s = st.z || dat.length;
	var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
	var w = o.subarray(pre, o.length - post);
	var lst = st.l;
	var pos = (st.r || 0) & 7;
	if (lvl) {
		if (pos) w[0] = st.r >> 3;
		var opt = deo[lvl - 1];
		var n = opt >> 13, c = opt & 8191;
		var msk_1 = (1 << plvl) - 1;
		var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
		var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
		var hsh = function(i) {
			return (dat[i] ^ dat[i + 1] << bs1_1 ^ dat[i + 2] << bs2_1) & msk_1;
		};
		var syms = new i32(25e3);
		var lf = new u16(288), df = new u16(32);
		var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
		for (; i + 2 < s; ++i) {
			var hv = hsh(i);
			var imod = i & 32767, pimod = head[hv];
			prev[imod] = pimod;
			head[hv] = imod;
			if (wi <= i) {
				var rem = s - i;
				if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
					pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
					li = lc_1 = eb = 0, bs = i;
					for (var j = 0; j < 286; ++j) lf[j] = 0;
					for (var j = 0; j < 30; ++j) df[j] = 0;
				}
				var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
				if (rem > 2 && hv == hsh(i - dif)) {
					var maxn = Math.min(n, rem) - 1;
					var maxd = Math.min(32767, i);
					var ml = Math.min(258, rem);
					while (dif <= maxd && --ch_1 && imod != pimod) {
						if (dat[i + l] == dat[i + l - dif]) {
							var nl = 0;
							for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl);
							if (nl > l) {
								l = nl, d = dif;
								if (nl > maxn) break;
								var mmd = Math.min(dif, nl - 2);
								var md = 0;
								for (var j = 0; j < mmd; ++j) {
									var ti = i - dif + j & 32767;
									var cd = ti - prev[ti] & 32767;
									if (cd > md) md = cd, pimod = ti;
								}
							}
						}
						imod = pimod, pimod = prev[imod];
						dif += imod - pimod & 32767;
					}
				}
				if (d) {
					syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
					var lin = revfl[l] & 31, din = revfd[d] & 31;
					eb += fleb[lin] + fdeb[din];
					++lf[257 + lin];
					++df[din];
					wi = i + l;
					++lc_1;
				} else {
					syms[li++] = dat[i];
					++lf[dat[i]];
				}
			}
		}
		for (i = Math.max(i, wi); i < s; ++i) {
			syms[li++] = dat[i];
			++lf[dat[i]];
		}
		pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
		if (!lst) {
			st.r = pos & 7 | w[pos / 8 | 0] << 3;
			pos -= 7;
			st.h = head, st.p = prev, st.i = i, st.w = wi;
		}
	} else {
		for (var i = st.w || 0; i < s + lst; i += 65535) {
			var e = i + 65535;
			if (e >= s) {
				w[pos / 8 | 0] = lst;
				e = s;
			}
			pos = wfblk(w, pos + 1, dat.subarray(i, e));
		}
		st.i = s;
	}
	return slc(o, 0, pre + shft(pos) + post);
};
var crct = /*#__PURE__*/ (function() {
	var t = /* @__PURE__ */ new Int32Array(256);
	for (var i = 0; i < 256; ++i) {
		var c = i, k = 9;
		while (--k) c = (c & 1 && -306674912) ^ c >>> 1;
		t[i] = c;
	}
	return t;
})();
var crc = function() {
	var c = -1;
	return {
		p: function(d) {
			var cr = c;
			for (var i = 0; i < d.length; ++i) cr = crct[cr & 255 ^ d[i]] ^ cr >>> 8;
			c = cr;
		},
		d: function() {
			return ~c;
		}
	};
};
var adler = function() {
	var a = 1, b = 0;
	return {
		p: function(d) {
			var n = a, m = b;
			var l = d.length | 0;
			for (var i = 0; i != l;) {
				var e = Math.min(i + 2655, l);
				for (; i < e; ++i) m += n += d[i];
				n = (n & 65535) + 15 * (n >> 16), m = (m & 65535) + 15 * (m >> 16);
			}
			a = n, b = m;
		},
		d: function() {
			a %= 65521, b %= 65521;
			return (a & 255) << 24 | (a & 65280) << 8 | (b & 255) << 8 | b >> 8;
		}
	};
};
var dopt = function(dat, opt, pre, post, st) {
	if (!st) {
		st = { l: 1 };
		if (opt.dictionary) {
			var dict = opt.dictionary.subarray(-32768);
			var newDat = new u8(dict.length + dat.length);
			newDat.set(dict);
			newDat.set(dat, dict.length);
			dat = newDat;
			st.w = dict.length;
		}
	}
	return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
};
var wbytes = function(d, b, v) {
	for (; v; ++b) d[b] = v, v >>>= 8;
};
var gzh = function(c, o) {
	var fn = o.filename;
	c[0] = 31, c[1] = 139, c[2] = 8, c[8] = o.level < 2 ? 4 : o.level == 9 ? 2 : 0, c[9] = 3;
	if (o.mtime != 0) wbytes(c, 4, Math.floor(new Date(o.mtime || Date.now()) / 1e3));
	if (fn) {
		c[3] = 8;
		for (var i = 0; i <= fn.length; ++i) c[i + 10] = fn.charCodeAt(i);
	}
};
var gzs = function(d) {
	if (d[0] != 31 || d[1] != 139 || d[2] != 8) err(6, "invalid gzip data");
	var flg = d[3];
	var st = 10;
	if (flg & 4) st += (d[10] | d[11] << 8) + 2;
	for (var zs = (flg >> 3 & 1) + (flg >> 4 & 1); zs > 0; zs -= !d[st++]);
	return st + (flg & 2);
};
var gzhl = function(o) {
	return 10 + (o.filename ? o.filename.length + 1 : 0);
};
var zlh = function(c, o) {
	var lv = o.level, fl = lv == 0 ? 0 : lv < 6 ? 1 : lv == 9 ? 3 : 2;
	c[0] = 120, c[1] = fl << 6 | (o.dictionary && 32);
	c[1] |= 31 - (c[0] << 8 | c[1]) % 31;
	if (o.dictionary) {
		var h = adler();
		h.p(o.dictionary);
		wbytes(c, 2, h.d());
	}
};
function deflateSync$2(data, opts) {
	return dopt(data, opts || {}, 0, 0);
}
var Inflate$1 = /* @__PURE__ */ function() {
	function Inflate(opts, cb) {
		if (typeof opts == "function") cb = opts, opts = {};
		this.ondata = cb;
		var dict = opts && opts.dictionary && opts.dictionary.subarray(-32768);
		this.s = {
			i: 0,
			b: dict ? dict.length : 0
		};
		this.o = new u8(32768);
		this.p = new u8(0);
		if (dict) this.o.set(dict);
	}
	Inflate.prototype.e = function(c) {
		if (!this.ondata) err(5);
		if (this.d) err(4);
		if (!this.p.length) this.p = c;
		else if (c.length) {
			var n = new u8(this.p.length + c.length);
			n.set(this.p), n.set(c, this.p.length), this.p = n;
		}
	};
	Inflate.prototype.c = function(final) {
		this.s.i = +(this.d = final || false);
		var bts = this.s.b;
		var dt = inflt(this.p, this.s, this.o);
		this.ondata(slc(dt, bts, this.s.b), this.d);
		this.o = slc(dt, this.s.b - 32768), this.s.b = this.o.length;
		this.p = slc(this.p, this.s.p / 8 | 0), this.s.p &= 7;
	};
	Inflate.prototype.push = function(chunk, final) {
		this.e(chunk), this.c(final);
	};
	return Inflate;
}();
function inflateSync$2(data, opts) {
	return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
function gzipSync$2(data, opts) {
	if (!opts) opts = {};
	var c = crc(), l = data.length;
	c.p(data);
	var d = dopt(data, opts, gzhl(opts), 8), s = d.length;
	return gzh(d, opts), wbytes(d, s - 8, c.d()), wbytes(d, s - 4, l), d;
}
var Gunzip$1 = /* @__PURE__ */ function() {
	function Gunzip(opts, cb) {
		this.v = 1;
		this.r = 0;
		Inflate$1.call(this, opts, cb);
	}
	Gunzip.prototype.push = function(chunk, final) {
		Inflate$1.prototype.e.call(this, chunk);
		this.r += chunk.length;
		if (this.v) {
			var p = this.p.subarray(this.v - 1);
			var s = p.length > 3 ? gzs(p) : 4;
			if (s > p.length) {
				if (!final) return;
			} else if (this.v > 1 && this.onmember) this.onmember(this.r - p.length);
			this.p = p.subarray(s), this.v = 0;
		}
		Inflate$1.prototype.c.call(this, 0);
		if (this.s.f && !this.s.l) {
			this.v = shft(this.s.p) + 9;
			this.s = { i: 0 };
			this.o = new u8(0);
			this.push(new u8(0), final);
		} else if (final) Inflate$1.prototype.c.call(this, final);
	};
	return Gunzip;
}();
function zlibSync(data, opts) {
	if (!opts) opts = {};
	var a = adler();
	a.p(data);
	var d = dopt(data, opts, opts.dictionary ? 6 : 2, 4);
	return zlh(d, opts), wbytes(d, d.length - 4, a.d()), d;
}
var td = typeof TextDecoder != "undefined" && /*#__PURE__*/ new TextDecoder();
try {
	td.decode(et, { stream: true });
} catch (e) {}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs
/* @__NO_SIDE_EFFECTS__ */
function createNotImplementedError(name) {
	return /* @__PURE__ */ new Error(`[unenv] ${name} is not implemented yet!`);
}
/* @__NO_SIDE_EFFECTS__ */
function notImplemented(name) {
	const fn = () => {
		throw /* @__PURE__ */ createNotImplementedError(name);
	};
	return Object.assign(fn, { __unenv__: true });
}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/zlib/codes.mjs
const codes = {
	"0": "Z_OK",
	"1": "Z_STREAM_END",
	"2": "Z_NEED_DICT",
	Z_OK: 0,
	Z_STREAM_END: 1,
	Z_NEED_DICT: 2,
	Z_ERRNO: -1,
	Z_STREAM_ERROR: -2,
	Z_DATA_ERROR: -3,
	Z_MEM_ERROR: -4,
	Z_BUF_ERROR: -5,
	Z_VERSION_ERROR: -6,
	"-1": "Z_ERRNO",
	"-2": "Z_STREAM_ERROR",
	"-3": "Z_DATA_ERROR",
	"-4": "Z_MEM_ERROR",
	"-5": "Z_BUF_ERROR",
	"-6": "Z_VERSION_ERROR"
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/zlib/formats/_shared.mjs
var ZlibCompress = class extends Transform {
	__unenv__ = true;
	bytesRead = 0;
	bytesWritten = 0;
	constructor(opts) {
		super(opts);
		throw /* @__PURE__ */ createNotImplementedError("zlib is not implemented yet!");
	}
	close(callback) {
		if (typeof callback === "function") callback();
	}
	flush(kind, callback) {
		if (typeof callback === "function") callback();
	}
};
var ZLibDecompress = class extends ZlibCompress {};
function notImplementedCompress(format) {
	const fn = function(_buf, arg2, arg3) {
		const cb = typeof arg2 === "function" ? arg2 : arg3;
		const err = /* @__PURE__ */ new Error(`[unenv] zlib ${format} compression not supported.`);
		if (typeof cb === "function") cb(err, Buffer.from(""));
		else throw err;
	};
	return Object.assign(fn, { __promisify__: (buffer, options) => {
		return new Promise((resolve, reject) => {
			fn(buffer, options, (err, result) => err ? reject(err) : resolve(result));
		});
	} });
}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/zlib/formats/brotli.mjs
var BrotliCompress = class extends ZlibCompress {
	_format = "brotli";
};
const brotliCompress = notImplementedCompress("brotliCompress");
const createBrotliCompress = () => new BrotliCompress();
const brotliCompressSync = /* @__PURE__ */ notImplemented("zlib.brotliCompressSync");
var BrotliDecompress = class extends ZLibDecompress {
	_format = "brotli";
};
const brotliDecompress = notImplementedCompress("brotliDecompress");
const createBrotliDecompress = () => new BrotliDecompress();
const brotliDecompressSync = /* @__PURE__ */ notImplemented("zlib.brotliDecompressSync");
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/zlib/formats/deflate.mjs
var Deflate = class extends ZlibCompress {
	_format = "deflate";
	params(level, strategy, callback) {
		throw /* @__PURE__ */ createNotImplementedError("Deflate.params");
	}
	reset() {
		throw /* @__PURE__ */ createNotImplementedError("Deflate.reset");
	}
};
const deflate$1 = notImplementedCompress("deflate");
const createDeflate = () => new Deflate();
const deflateSync$1 = /* @__PURE__ */ notImplemented("zlib.deflateSync");
var Inflate = class extends ZLibDecompress {
	_format = "deflate";
	reset() {
		throw /* @__PURE__ */ createNotImplementedError("Inflate.reset");
	}
};
const inflate$1 = notImplementedCompress("inflate");
const createInflate = () => new Inflate();
const inflateSync$1 = /* @__PURE__ */ notImplemented("zlib.inflateSync");
var DeflateRaw = class extends Deflate {};
const deflateRaw$1 = notImplementedCompress("deflateRaw");
const createDeflateRaw = () => new DeflateRaw();
const deflateRawSync$1 = /* @__PURE__ */ notImplemented("zlib.deflateRawSync");
var InflateRaw = class extends Inflate {};
const inflateRaw$1 = notImplementedCompress("inflateRaw");
const createInflateRaw = () => new InflateRaw();
const inflateRawSync$1 = /* @__PURE__ */ notImplemented("zlib.inflateRawSync");
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/zlib/formats/gzip.mjs
var Gzip = class extends ZlibCompress {
	_format = "gzip";
};
const gzip$1 = notImplementedCompress("gzip");
const createGzip = () => new Gzip();
const gzipSync$1 = /* @__PURE__ */ notImplemented("zlib.gzipSync");
var Gunzip = class extends ZLibDecompress {
	_format = "gzip";
};
const gunzip$1 = notImplementedCompress("gunzip");
const createGunzip = () => new Gunzip();
const gunzipSync$1 = /* @__PURE__ */ notImplemented("zlib.gunzipSync");
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/zlib/formats/zip.mjs
var Unzip = class extends ZlibCompress {
	_format = "zip";
};
const createUnzip = () => new Unzip();
const unzip$1 = /* @__PURE__ */ notImplemented("zlib.unzip");
const unzipSync$1 = /* @__PURE__ */ notImplemented("zlib.unzipSync");
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/zlib/constants.mjs
const Z_NO_FLUSH = 0;
const Z_PARTIAL_FLUSH = 1;
const Z_SYNC_FLUSH = 2;
const Z_FULL_FLUSH = 3;
const Z_FINISH = 4;
const Z_BLOCK = 5;
const Z_OK = 0;
const Z_STREAM_END = 1;
const Z_NEED_DICT = 2;
const Z_ERRNO = -1;
const Z_STREAM_ERROR = -2;
const Z_DATA_ERROR = -3;
const Z_MEM_ERROR = -4;
const Z_BUF_ERROR = -5;
const Z_VERSION_ERROR = -6;
const Z_NO_COMPRESSION = 0;
const Z_BEST_SPEED = 1;
const Z_BEST_COMPRESSION = 9;
const Z_DEFAULT_COMPRESSION = -1;
const Z_FILTERED = 1;
const Z_HUFFMAN_ONLY = 2;
const Z_RLE = 3;
const Z_FIXED = 4;
const Z_DEFAULT_STRATEGY = 0;
const ZLIB_VERNUM = 4865;
const DEFLATE = 1;
const INFLATE = 2;
const GZIP = 3;
const GUNZIP = 4;
const DEFLATERAW = 5;
const INFLATERAW = 6;
const UNZIP = 7;
const Z_MIN_WINDOWBITS = 8;
const Z_MAX_WINDOWBITS = 15;
const Z_DEFAULT_WINDOWBITS = 15;
const Z_MIN_CHUNK = 64;
const Z_MAX_CHUNK = Number.POSITIVE_INFINITY;
const Z_DEFAULT_CHUNK = 16384;
const Z_MIN_MEMLEVEL = 1;
const Z_MAX_MEMLEVEL = 9;
const Z_DEFAULT_MEMLEVEL = 8;
const Z_MIN_LEVEL = -1;
const Z_MAX_LEVEL = 9;
const Z_DEFAULT_LEVEL = -1;
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/zlib.mjs
const constants = {
	Z_NO_FLUSH: 0,
	Z_PARTIAL_FLUSH: 1,
	Z_SYNC_FLUSH: 2,
	Z_FULL_FLUSH: 3,
	Z_FINISH: 4,
	Z_BLOCK: 5,
	Z_OK: 0,
	Z_STREAM_END: 1,
	Z_NEED_DICT: 2,
	Z_ERRNO: -1,
	Z_STREAM_ERROR: -2,
	Z_DATA_ERROR: -3,
	Z_MEM_ERROR: -4,
	Z_BUF_ERROR: -5,
	Z_VERSION_ERROR: -6,
	Z_NO_COMPRESSION: 0,
	Z_BEST_SPEED: 1,
	Z_BEST_COMPRESSION: 9,
	Z_DEFAULT_COMPRESSION: -1,
	Z_FILTERED: 1,
	Z_HUFFMAN_ONLY: 2,
	Z_RLE: 3,
	Z_FIXED: 4,
	Z_DEFAULT_STRATEGY: 0,
	ZLIB_VERNUM,
	DEFLATE: 1,
	INFLATE: 2,
	GZIP: 3,
	GUNZIP: 4,
	DEFLATERAW: 5,
	INFLATERAW: 6,
	UNZIP: 7,
	BROTLI_DECODE: 8,
	BROTLI_ENCODE: 9,
	Z_MIN_WINDOWBITS: 8,
	Z_MAX_WINDOWBITS: 15,
	Z_DEFAULT_WINDOWBITS: 15,
	Z_MIN_CHUNK: 64,
	Z_MAX_CHUNK,
	Z_DEFAULT_CHUNK,
	Z_MIN_MEMLEVEL: 1,
	Z_MAX_MEMLEVEL: 9,
	Z_DEFAULT_MEMLEVEL: 8,
	Z_MIN_LEVEL: -1,
	Z_MAX_LEVEL: 9,
	Z_DEFAULT_LEVEL: -1,
	BROTLI_OPERATION_PROCESS: 0,
	BROTLI_OPERATION_FLUSH: 1,
	BROTLI_OPERATION_FINISH: 2,
	BROTLI_OPERATION_EMIT_METADATA: 3,
	BROTLI_PARAM_MODE: 0,
	BROTLI_MODE_GENERIC: 0,
	BROTLI_MODE_TEXT: 1,
	BROTLI_MODE_FONT: 2,
	BROTLI_DEFAULT_MODE: 0,
	BROTLI_PARAM_QUALITY: 1,
	BROTLI_MIN_QUALITY: 0,
	BROTLI_MAX_QUALITY: 11,
	BROTLI_DEFAULT_QUALITY: 11,
	BROTLI_PARAM_LGWIN: 2,
	BROTLI_MIN_WINDOW_BITS: 10,
	BROTLI_MAX_WINDOW_BITS: 24,
	BROTLI_LARGE_MAX_WINDOW_BITS: 30,
	BROTLI_DEFAULT_WINDOW: 22,
	BROTLI_PARAM_LGBLOCK: 3,
	BROTLI_MIN_INPUT_BLOCK_BITS: 16,
	BROTLI_MAX_INPUT_BLOCK_BITS: 24,
	BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING: 4,
	BROTLI_PARAM_SIZE_HINT: 5,
	BROTLI_PARAM_LARGE_WINDOW: 6,
	BROTLI_PARAM_NPOSTFIX: 7,
	BROTLI_PARAM_NDIRECT: 8,
	BROTLI_DECODER_RESULT_ERROR: 0,
	BROTLI_DECODER_RESULT_SUCCESS: 1,
	BROTLI_DECODER_RESULT_NEEDS_MORE_INPUT: 2,
	BROTLI_DECODER_RESULT_NEEDS_MORE_OUTPUT: 3,
	BROTLI_DECODER_PARAM_DISABLE_RING_BUFFER_REALLOCATION: 0,
	BROTLI_DECODER_PARAM_LARGE_WINDOW: 1,
	BROTLI_DECODER_NO_ERROR: 0,
	BROTLI_DECODER_SUCCESS: 1,
	BROTLI_DECODER_NEEDS_MORE_INPUT: 2,
	BROTLI_DECODER_NEEDS_MORE_OUTPUT: 3,
	BROTLI_DECODER_ERROR_FORMAT_EXUBERANT_NIBBLE: -1,
	BROTLI_DECODER_ERROR_FORMAT_RESERVED: -2,
	BROTLI_DECODER_ERROR_FORMAT_EXUBERANT_META_NIBBLE: -3,
	BROTLI_DECODER_ERROR_FORMAT_SIMPLE_HUFFMAN_ALPHABET: -4,
	BROTLI_DECODER_ERROR_FORMAT_SIMPLE_HUFFMAN_SAME: -5,
	BROTLI_DECODER_ERROR_FORMAT_CL_SPACE: -6,
	BROTLI_DECODER_ERROR_FORMAT_HUFFMAN_SPACE: -7,
	BROTLI_DECODER_ERROR_FORMAT_CONTEXT_MAP_REPEAT: -8,
	BROTLI_DECODER_ERROR_FORMAT_BLOCK_LENGTH_1: -9,
	BROTLI_DECODER_ERROR_FORMAT_BLOCK_LENGTH_2: -10,
	BROTLI_DECODER_ERROR_FORMAT_TRANSFORM: -11,
	BROTLI_DECODER_ERROR_FORMAT_DICTIONARY: -12,
	BROTLI_DECODER_ERROR_FORMAT_WINDOW_BITS: -13,
	BROTLI_DECODER_ERROR_FORMAT_PADDING_1: -14,
	BROTLI_DECODER_ERROR_FORMAT_PADDING_2: -15,
	BROTLI_DECODER_ERROR_FORMAT_DISTANCE: -16,
	BROTLI_DECODER_ERROR_DICTIONARY_NOT_SET: -19,
	BROTLI_DECODER_ERROR_INVALID_ARGUMENTS: -20,
	BROTLI_DECODER_ERROR_ALLOC_CONTEXT_MODES: -21,
	BROTLI_DECODER_ERROR_ALLOC_TREE_GROUPS: -22,
	BROTLI_DECODER_ERROR_ALLOC_CONTEXT_MAP: -25,
	BROTLI_DECODER_ERROR_ALLOC_RING_BUFFER_1: -26,
	BROTLI_DECODER_ERROR_ALLOC_RING_BUFFER_2: -27,
	BROTLI_DECODER_ERROR_ALLOC_BLOCK_TYPE_TREES: -30,
	BROTLI_DECODER_ERROR_UNREACHABLE: -31
};
var zlib_default$1 = {
	Z_NO_FLUSH: 0,
	Z_PARTIAL_FLUSH: 1,
	Z_SYNC_FLUSH: 2,
	Z_FULL_FLUSH: 3,
	Z_FINISH: 4,
	Z_BLOCK: 5,
	Z_OK: 0,
	Z_STREAM_END: 1,
	Z_NEED_DICT: 2,
	Z_ERRNO: -1,
	Z_STREAM_ERROR: -2,
	Z_DATA_ERROR: -3,
	Z_MEM_ERROR: -4,
	Z_BUF_ERROR: -5,
	Z_VERSION_ERROR: -6,
	Z_NO_COMPRESSION: 0,
	Z_BEST_SPEED: 1,
	Z_BEST_COMPRESSION: 9,
	Z_DEFAULT_COMPRESSION: -1,
	Z_FILTERED: 1,
	Z_HUFFMAN_ONLY: 2,
	Z_RLE: 3,
	Z_FIXED: 4,
	Z_DEFAULT_STRATEGY: 0,
	ZLIB_VERNUM,
	DEFLATE: 1,
	INFLATE: 2,
	GZIP: 3,
	GUNZIP: 4,
	DEFLATERAW: 5,
	INFLATERAW: 6,
	UNZIP: 7,
	Z_MIN_WINDOWBITS: 8,
	Z_MAX_WINDOWBITS: 15,
	Z_DEFAULT_WINDOWBITS: 15,
	Z_MIN_CHUNK: 64,
	Z_MAX_CHUNK,
	Z_DEFAULT_CHUNK,
	Z_MIN_MEMLEVEL: 1,
	Z_MAX_MEMLEVEL: 9,
	Z_DEFAULT_MEMLEVEL: 8,
	Z_MIN_LEVEL: -1,
	Z_MAX_LEVEL: 9,
	Z_DEFAULT_LEVEL: -1,
	constants,
	BrotliCompress,
	BrotliDecompress,
	brotliCompress,
	brotliCompressSync,
	brotliDecompress,
	brotliDecompressSync,
	createBrotliCompress,
	createBrotliDecompress,
	Deflate,
	DeflateRaw,
	Inflate,
	InflateRaw,
	createDeflate,
	createDeflateRaw,
	createInflate,
	createInflateRaw,
	deflate: deflate$1,
	deflateRaw: deflateRaw$1,
	deflateRawSync: deflateRawSync$1,
	deflateSync: deflateSync$1,
	inflate: inflate$1,
	inflateRaw: inflateRaw$1,
	inflateRawSync: inflateRawSync$1,
	inflateSync: inflateSync$1,
	Gunzip,
	Gzip,
	createGunzip,
	createGzip,
	gunzip: gunzip$1,
	gunzipSync: gunzipSync$1,
	gzip: gzip$1,
	gzipSync: gzipSync$1,
	Unzip,
	createUnzip,
	unzip: unzip$1,
	unzipSync: unzipSync$1,
	codes,
	crc32: /* @__PURE__ */ notImplemented("zlib.crc32")
};
//#endregion
//#region src/node/zlib.ts
const Buffer$2 = Buffer$1;
function bytesOf(data, name = "buffer") {
	if (typeof data === "string") return Buffer$2.from(data);
	if (data instanceof ArrayBuffer && name !== "data") return new Uint8Array(data);
	if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	throw Object.assign(/* @__PURE__ */ new TypeError(`The "${name}" argument must be of type string or an instance of ${name === "data" ? "Buffer, TypedArray, or DataView" : "Buffer, TypedArray, DataView, or ArrayBuffer"}`), { code: "ERR_INVALID_ARG_TYPE" });
}
const zlibError = (message, errno, code) => Object.assign(new Error(message), {
	errno,
	code
});
const endedTooSoon = () => zlibError("unexpected end of file", -5, "Z_BUF_ERROR");
const badData = (message) => zlibError(message, -3, "Z_DATA_ERROR");
const tooLarge = (limit) => Object.assign(/* @__PURE__ */ new RangeError(`Cannot create a Buffer larger than ${limit} bytes`), { code: "ERR_BUFFER_TOO_LARGE" });
const notHere = (name) => /* @__PURE__ */ new Error(`vitest-plugin-rsc: zlib's ${name} is not there in the browser`);
function optionsOf(options, inflate) {
	const own = options ?? {};
	for (const [name, min, max] of [
		[
			"level",
			-1,
			9
		],
		[
			"memLevel",
			1,
			9
		],
		[
			"windowBits",
			8,
			15
		],
		[
			"chunkSize",
			64,
			Infinity
		],
		[
			"maxOutputLength",
			1,
			2 ** 53 - 1
		]
	]) {
		const value = own[name];
		if (value === void 0 || name === "windowBits" && inflate && value === 0) continue;
		if (typeof value !== "number" || Number.isNaN(value) || value < min || value > max) throw Object.assign(/* @__PURE__ */ new RangeError(`The value of "options.${name}" is out of range. It must be >= ${min}${max === Infinity ? "" : ` and <= ${max}`}. Received ${value}`), { code: "ERR_OUT_OF_RANGE" });
	}
	if (own.info) throw notHere("`info` option");
	if (own.flush !== void 0 && own.flush !== 0) throw notHere("`flush` option");
	if (own.finishFlush !== void 0 && own.finishFlush !== 4) throw notHere("`finishFlush` option");
	if (own.windowBits !== void 0 && own.windowBits !== 15 && own.windowBits !== 0) throw notHere("window of less than 32 KiB");
	return own;
}
function fflateCall(call) {
	try {
		return call();
	} catch (error) {
		const { code, message } = error;
		throw code === 0 ? endedTooSoon() : badData(message);
	}
}
const crcTable = Int32Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
	return c;
});
function crc32(data, value = 0) {
	const bytes = bytesOf(data, "data");
	let crc = ~value;
	for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
	return ~crc >>> 0;
}
function adler32(bytes) {
	let [a, b] = [1, 0];
	for (let i = 0; i < bytes.length; i += 5552) {
		for (const byte of bytes.subarray(i, i + 5552)) b += a += byte;
		[a, b] = [a % 65521, b % 65521];
	}
	return (b << 16 | a) >>> 0;
}
function gzipHeaderLength(bytes) {
	if (bytes.length < 10) throw endedTooSoon();
	if (bytes[0] !== 31 || bytes[1] !== 139) throw badData("incorrect header check");
	if (bytes[2] !== 8) throw badData("unknown compression method");
	const flags = bytes[3];
	if (flags & 224) throw badData("unknown header flags set");
	let at = 10;
	if (flags & 4) at += 2 + (bytes[10] | bytes[11] << 8);
	for (const flag of [8, 16]) if (flags & flag) {
		at = bytes.indexOf(0, at) + 1;
		if (at === 0) throw endedTooSoon();
	}
	if (flags & 2) {
		if (bytes.length < at + 2) throw endedTooSoon();
		if ((bytes[at] | bytes[at + 1] << 8) >>> 0 !== (crc32(bytes.subarray(0, at)) & 65535)) throw badData("header crc mismatch");
		at += 2;
	}
	return at;
}
function decompress(format, data, given) {
	const options = optionsOf(given, true);
	const bytes = bytesOf(data);
	const kind = format === "unzip" ? bytes[0] === 31 && bytes[1] === 139 ? "gzip" : "deflate" : format;
	let start = 0;
	let dictionary;
	if (kind === "gzip") start = gzipHeaderLength(bytes);
	if (kind === "deflate") {
		if (bytes.length < 2) throw endedTooSoon();
		const [method, flags] = [bytes[0], bytes[1]];
		if ((method * 256 + flags) % 31 !== 0) throw badData("incorrect header check");
		if ((method & 15) !== 8) throw badData("unknown compression method");
		if (method >> 4 > 7) throw badData("invalid window size");
		start = 2;
		if (flags & 32) {
			if (bytes.length < 6) throw endedTooSoon();
			if (options.dictionary === void 0) throw zlibError("Missing dictionary", 2, "Z_NEED_DICT");
			dictionary = bytesOf(options.dictionary, "dictionary");
			const id = new DataView(bytes.buffer, bytes.byteOffset).getUint32(2);
			if (adler32(dictionary) !== id) throw zlibError("Bad dictionary", 2, "Z_NEED_DICT");
			start = 6;
		}
	}
	if (kind === "deflate-raw" && options.dictionary !== void 0) dictionary = bytesOf(options.dictionary, "dictionary");
	const trailer = kind === "gzip" ? 8 : kind === "deflate" ? 4 : 0;
	if (bytes.length <= start + trailer) throw endedTooSoon();
	const view = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - trailer);
	const inflate = () => fflateCall(() => inflateSync$2(bytes.subarray(start, bytes.length - trailer), { dictionary }));
	let result;
	if (kind === "gzip") {
		const chunks = [];
		let members = 1;
		const gunzip = new Gunzip$1((chunk) => chunks.push(chunk));
		gunzip.onmember = () => members++;
		fflateCall(() => gunzip.push(bytes.subarray(0, bytes.length - trailer), true));
		if (members > 1) throw new Error("vitest-plugin-rsc: zlib's gzip of more than one member is not there in the browser");
		result = Buffer$2.concat(chunks);
		const failed = view.getUint32(0, true) !== crc32(result) ? "incorrect data check" : view.getUint32(4, true) !== result.length >>> 0 ? "incorrect length check" : void 0;
		if (failed) {
			inflate();
			throw badData(failed);
		}
	} else {
		result = inflate();
		if (kind === "deflate" && view.getUint32(0) !== adler32(result)) throw badData("incorrect data check");
	}
	if (result.length > (options.maxOutputLength ?? Infinity)) throw tooLarge(options.maxOutputLength);
	return Buffer$2.from(result.buffer, result.byteOffset, result.length);
}
function compress(format, data, given) {
	const options = optionsOf(given, false);
	const bytes = bytesOf(data);
	const fflate = {
		...options.level !== void 0 && options.level >= 0 && { level: options.level },
		...options.dictionary !== void 0 && format !== "gzip" && { dictionary: bytesOf(options.dictionary, "dictionary") }
	};
	const result = format === "gzip" ? gzipSync$2(bytes, {
		...fflate,
		mtime: 0
	}) : format === "deflate" ? zlibSync(bytes, fflate) : deflateSync$2(bytes, fflate);
	if (result.length > (options.maxOutputLength ?? Infinity)) throw tooLarge(options.maxOutputLength);
	return Buffer$2.from(result.buffer, result.byteOffset, result.length);
}
const gzipSync = (data, options) => compress("gzip", data, options);
const gunzipSync = (data, options) => decompress("gzip", data, options);
const deflateSync = (data, options) => compress("deflate", data, options);
const inflateSync = (data, options) => decompress("deflate", data, options);
const deflateRawSync = (data, options) => compress("deflate-raw", data, options);
const inflateRawSync = (data, options) => decompress("deflate-raw", data, options);
const unzipSync = (data, options) => decompress("unzip", data, options);
const asyncOf = (run) => function(data, options, callback) {
	const done = typeof options === "function" ? options : callback;
	if (typeof done !== "function") throw Object.assign(/* @__PURE__ */ new TypeError("The \"callback\" argument must be of type function"), { code: "ERR_INVALID_ARG_TYPE" });
	const bytes = Uint8Array.from(bytesOf(data));
	const own = typeof options === "function" ? void 0 : options;
	setTimeout(() => {
		let result;
		try {
			result = run(bytes, own);
		} catch (error) {
			done(error);
			return;
		}
		done(null, result);
	});
};
const gzip = asyncOf(gzipSync);
const gunzip = asyncOf(gunzipSync);
const deflate = asyncOf(deflateSync);
const inflate = asyncOf(inflateSync);
const deflateRaw = asyncOf(deflateRawSync);
const inflateRaw = asyncOf(inflateRawSync);
const unzip = asyncOf(unzipSync);
const missing = (name) => function(..._args) {
	throw new Error(`vitest-plugin-rsc: ${name} of Node.js is not there in the browser`);
};
const ZstdCompress = missing("zlib.ZstdCompress");
const ZstdDecompress = missing("zlib.ZstdDecompress");
const zstdCompress = missing("zlib.zstdCompress");
const zstdCompressSync = missing("zlib.zstdCompressSync");
const zstdDecompress = missing("zlib.zstdDecompress");
const zstdDecompressSync = missing("zlib.zstdDecompressSync");
const createZstdCompress = missing("zlib.createZstdCompress");
const createZstdDecompress = missing("zlib.createZstdDecompress");
var zlib_default = {
	...zlib_default$1,
	crc32,
	gzipSync,
	gunzipSync,
	deflateSync,
	inflateSync,
	deflateRawSync,
	inflateRawSync,
	unzipSync,
	gzip,
	gunzip,
	deflate,
	inflate,
	deflateRaw,
	inflateRaw,
	unzip,
	ZstdCompress,
	ZstdDecompress,
	zstdCompress,
	zstdCompressSync,
	zstdDecompress,
	zstdDecompressSync,
	createZstdCompress,
	createZstdDecompress
};
//#endregion
export { BrotliCompress, BrotliDecompress, DEFLATE, DEFLATERAW, Deflate, DeflateRaw, GUNZIP, GZIP, Gunzip, Gzip, INFLATE, INFLATERAW, Inflate, InflateRaw, UNZIP, Unzip, ZLIB_VERNUM, Z_BEST_COMPRESSION, Z_BEST_SPEED, Z_BLOCK, Z_BUF_ERROR, Z_DATA_ERROR, Z_DEFAULT_CHUNK, Z_DEFAULT_COMPRESSION, Z_DEFAULT_LEVEL, Z_DEFAULT_MEMLEVEL, Z_DEFAULT_STRATEGY, Z_DEFAULT_WINDOWBITS, Z_ERRNO, Z_FILTERED, Z_FINISH, Z_FIXED, Z_FULL_FLUSH, Z_HUFFMAN_ONLY, Z_MAX_CHUNK, Z_MAX_LEVEL, Z_MAX_MEMLEVEL, Z_MAX_WINDOWBITS, Z_MEM_ERROR, Z_MIN_CHUNK, Z_MIN_LEVEL, Z_MIN_MEMLEVEL, Z_MIN_WINDOWBITS, Z_NEED_DICT, Z_NO_COMPRESSION, Z_NO_FLUSH, Z_OK, Z_PARTIAL_FLUSH, Z_RLE, Z_STREAM_END, Z_STREAM_ERROR, Z_SYNC_FLUSH, Z_VERSION_ERROR, ZstdCompress, ZstdDecompress, brotliCompress, brotliCompressSync, brotliDecompress, brotliDecompressSync, codes, constants, crc32, createBrotliCompress, createBrotliDecompress, createDeflate, createDeflateRaw, createGunzip, createGzip, createInflate, createInflateRaw, createUnzip, createZstdCompress, createZstdDecompress, zlib_default as default, deflate, deflateRaw, deflateRawSync, deflateSync, gunzip, gunzipSync, gzip, gzipSync, inflate, inflateRaw, inflateRawSync, inflateSync, unzip, unzipSync, zstdCompress, zstdCompressSync, zstdDecompress, zstdDecompressSync };
