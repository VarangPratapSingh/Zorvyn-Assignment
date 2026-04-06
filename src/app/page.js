// app/page.js
"use client";

import { useCallback, useEffect, useState } from "react";

const API=process.env.NEXT_PUBLIC_API_URL||"http://localhost:4000/api";
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ROLE_COLOR={admin:"#1d1d1f",analyst:"#0071e3",viewer:"#8e8e93"};
const DEFAULT_FORM={amount:"",type:"income",category:"",date:"",note:""};

const decodeJwt=(tok)=>{
    try{
        const b64=tok.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
        return JSON.parse(decodeURIComponent(atob(b64).split("").map((c)=>"%"+c.charCodeAt(0).toString(16).padStart(2,"0")).join("")));
    }catch{
        return null;
    }
};

const ah=(tok)=>({"Content-Type":"application/json",Authorization:`Bearer ${tok}`});
const fmt=(n)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n??0);
const fmtDate=(d)=>new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});

const requestJson=async(url,options={})=>{
    const r=await fetch(url,options);
    const d=await r.json();
    return {r,d};
};

function TrendChart({trends}){
    if(!trends?.length)return null;
    const maxVal=Math.max(...trends.flatMap((t)=>[t.income,t.expense]),1);

    return(
        <div className="trend-chart">
            {trends.map((t,i)=>(
                <div key={i} className="trend-col">
                    <div className="trend-bars">
                        <div
                            style={{
                                flex:1,
                                background:"linear-gradient(180deg, rgba(52,199,89,.92), rgba(52,199,89,.55))",
                                borderRadius:"10px 10px 0 0",
                                height:`${(t.income/maxVal)*100}%`,
                                minHeight:t.income?4:0,
                                transition:"height .55s ease",
                                boxShadow:"0 8px 20px rgba(52,199,89,.16)",
                            }}
                            title={`Income: ${fmt(t.income)}`}
                        />
                        <div
                            style={{
                                flex:1,
                                background:"linear-gradient(180deg, rgba(255,59,48,.92), rgba(255,59,48,.55))",
                                borderRadius:"10px 10px 0 0",
                                height:`${(t.expense/maxVal)*100}%`,
                                minHeight:t.expense?4:0,
                                transition:"height .55s ease",
                                boxShadow:"0 8px 20px rgba(255,59,48,.14)",
                            }}
                            title={`Expense: ${fmt(t.expense)}`}
                        />
                    </div>
                    <span className="trend-label">{t.month?MONTHS[t.month-1]:`W${t.week}`}</span>
                </div>
            ))}
        </div>
    );
}

function DonutChart({data}){
    if(!data?.length)return null;
    const total=data.reduce((sum,item)=>sum+item.total,0);
    const colors=["#0071e3","#34c759","#ff9f0a","#5856d6","#5ac8fa","#8e8e93"];
    let angle=0;

    const slices=data.slice(0,6).map((item,i)=>{
        const pct=item.total/total;
        const start=angle;
        angle+=pct*360;
        return {...item,pct,start,end:angle,color:colors[i%colors.length]};
    });

    const polarToXY=(deg,r)=>{
        const rad=((deg-90)*Math.PI)/180;
        return {x:50+r*Math.cos(rad),y:50+r*Math.sin(rad)};
    };

    const arcPath=(startDeg,endDeg,r=38,inner=24)=>{
        if(endDeg-startDeg>=359.9)endDeg=359.89;
        const s=polarToXY(startDeg,r),e=polarToXY(endDeg,r);
        const si=polarToXY(startDeg,inner),ei=polarToXY(endDeg,inner);
        const large=endDeg-startDeg>180?1:0;
        return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} L ${ei.x} ${ei.y} A ${inner} ${inner} 0 ${large} 0 ${si.x} ${si.y} Z`;
    };

    return(
        <div className="donut-wrap">
            <svg viewBox="0 0 100 100" width={108} height={108} className="donut-svg">
                {slices.map((s,i)=>(
                    <path key={i} d={arcPath(s.start,s.end)} fill={s.color} opacity={0.92}>
                        <title>{s._id}: {fmt(s.total)}</title>
                    </path>
                ))}
                <circle cx="50" cy="50" r="16" fill="rgba(255,255,255,.88)" stroke="rgba(0,0,0,.08)"/>
            </svg>

            <div className="donut-legend">
                {slices.map((s,i)=>(
                    <div key={i} className="donut-row">
                        <span className="donut-dot" style={{background:s.color}}/>
                        <span className="donut-name">{s._id}</span>
                        <span className="donut-value">{Math.round(s.pct*100)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Modal({open,title,onClose,children}){
    useEffect(()=>{
        const handler=(e)=>{if(e.key==="Escape")onClose();};
        if(open)window.addEventListener("keydown",handler);
        return()=>window.removeEventListener("keydown",handler);
    },[open,onClose]);

    if(!open)return null;

    return(
        <div className="modal-overlay" onClick={(e)=>{if(e.target===e.currentTarget)onClose();}}>
            <div className="modal-card">
                <div className="modal-head">
                    <span>{title}</span>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                {children}
            </div>
        </div>
    );
}

export default function Page(){
    const [token,setToken]=useState("");
    const [role,setRole]=useState("");
    const [user,setUser]=useState(null);
    const [isRegister,setIsRegister]=useState(false);
    const [authErr,setAuthErr]=useState("");
    const [authLoading,setAuthLoading]=useState(false);
    const [name,setName]=useState("");
    const [email,setEmail]=useState("");
    const [password,setPassword]=useState("");
    const [adminSecret,setAdminSecret]=useState("");

    const [summary,setSummary]=useState(null);
    const [categoryData,setCategoryData]=useState([]);
    const [recent,setRecent]=useState([]);
    const [trends,setTrends]=useState([]);
    const [records,setRecords]=useState([]);
    const [recPage,setRecPage]=useState(1);
    const [recTotal,setRecTotal]=useState(0);
    const [recPages,setRecPages]=useState(1);
    const [users,setUsers]=useState([]);
    const [dashErr,setDashErr]=useState("");

    const [filterType,setFilterType]=useState("");
    const [filterCategory,setFilterCategory]=useState("");
    const [filterFrom,setFilterFrom]=useState("");
    const [filterTo,setFilterTo]=useState("");
    const [filterSearch,setFilterSearch]=useState("");

    const [editRecord,setEditRecord]=useState(null);
    const [showRecordModal,setShowRecordModal]=useState(false);
    const [form,setForm]=useState(DEFAULT_FORM);
    const [formErr,setFormErr]=useState("");
    const [formOk,setFormOk]=useState(false);
    const [formLoading,setFormLoading]=useState(false);

    const [tab,setTab]=useState("dashboard");

    const isViewer=role==="viewer";
    const isAdmin=role==="admin";
    const canWrite=isAdmin||role==="analyst";
    const roleColor=ROLE_COLOR[role]||"#8e8e93";
    const activeFilters=[filterType,filterCategory,filterFrom,filterTo,filterSearch].some(Boolean);
    const pageNumbers=Array.from({length:recPages},(_,i)=>i+1);

    const applyToken=(tok,userData)=>{
        localStorage.setItem("token",tok);
        setToken(tok);
        const payload=decodeJwt(tok);
        setRole(payload?.role||"");
        if(userData)setUser(userData);
    };

    const login=async()=>{
        setAuthErr("");
        setAuthLoading(true);
        try{
            const {r,d}=await requestJson(`${API}/auth/login`,{
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify({email,password}),
            });
            if(!r.ok)return setAuthErr(d.msg||"Login failed");
            applyToken(d.token,d.user);
        }catch{
            setAuthErr("Cannot reach server.");
        }finally{
            setAuthLoading(false);
        }
    };

    const register=async()=>{
        setAuthErr("");
        setAuthLoading(true);
        try{
            const {r,d}=await requestJson(`${API}/auth/register`,{
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify({name,email,password,adminSecret}),
            });
            if(!r.ok)return setAuthErr(d.msg||"Registration failed");
            setIsRegister(false);
            setAuthErr("");
            setName("");
            setAdminSecret("");
        }catch{
            setAuthErr("Cannot reach server.");
        }finally{
            setAuthLoading(false);
        }
    };

    const logout=()=>{
        localStorage.removeItem("token");
        setToken("");
        setRole("");
        setUser(null);
        setSummary(null);
        setRecords([]);
        setUsers([]);
        setTab("dashboard");
    };

    const fetchSummary=useCallback(async()=>{
        if(!token||isViewer)return;
        try{
            const {r,d}=await requestJson(`${API}/dashboard/summary`,{headers:ah(token)});
            if(r.ok)setSummary(d);
        }catch{
            setDashErr("Failed to load summary");
        }
    },[token,isViewer]);

    const fetchCategory=useCallback(async()=>{
        if(!token||isViewer)return;
        try{
            const {r,d}=await requestJson(`${API}/dashboard/category`,{headers:ah(token)});
            if(r.ok)setCategoryData(d);
        }catch{}
    },[token,isViewer]);

    const fetchRecent=useCallback(async()=>{
        if(!token||isViewer)return;
        try{
            const {r,d}=await requestJson(`${API}/dashboard/recent`,{headers:ah(token)});
            if(r.ok)setRecent(d);
        }catch{}
    },[token,isViewer]);

    const fetchTrends=useCallback(async(groupBy="monthly")=>{
        if(!token||isViewer)return;
        try{
            const params=new URLSearchParams({groupBy});
            if(filterFrom)params.set("from",filterFrom);
            if(filterTo)params.set("to",filterTo);
            const {r,d}=await requestJson(`${API}/dashboard/trends?${params}`,{headers:ah(token)});
            if(r.ok)setTrends(d);
        }catch{}
    },[token,isViewer,filterFrom,filterTo]);

    const fetchRecords=useCallback(async(page=1)=>{
        if(!token)return;
        try{
            const params=new URLSearchParams({page:String(page),limit:"10"});
            if(filterType)params.set("type",filterType);
            if(filterCategory)params.set("category",filterCategory);
            if(filterFrom)params.set("from",filterFrom);
            if(filterTo)params.set("to",filterTo);
            if(filterSearch)params.set("search",filterSearch);

            const {r,d}=await requestJson(`${API}/records?${params}`,{headers:ah(token)});
            if(r.ok){
                setRecords(d.data??[]);
                setRecTotal(d.total??0);
                setRecPages(d.totalPages??1);
                setRecPage(d.page??1);
            }else{
                setDashErr(d.msg||"Failed to load records");
            }
        }catch{
            setDashErr("Failed to load records");
        }
    },[token,filterType,filterCategory,filterFrom,filterTo,filterSearch]);

    const fetchUsers=useCallback(async()=>{
        if(!token||!isAdmin)return;
        try{
            const {r,d}=await requestJson(`${API}/admin/users`,{headers:ah(token)});
            if(r.ok)setUsers(d);
        }catch{}
    },[token,isAdmin]);

    const refreshDashboard=useCallback(()=>{
        if(!token||isViewer)return;
        fetchSummary();
        fetchCategory();
        fetchRecent();
        fetchTrends();
    },[token,isViewer,fetchSummary,fetchCategory,fetchRecent,fetchTrends]);

    const resetRecordState=()=>{
        setFormErr("");
        setFormOk(false);
    };

    const clearFilters=()=>{
        setFilterType("");
        setFilterCategory("");
        setFilterFrom("");
        setFilterTo("");
        setFilterSearch("");
    };

    useEffect(()=>{
        const saved=localStorage.getItem("token");
        if(saved){
            const payload=decodeJwt(saved);
            if(payload?.exp&&payload.exp*1000>Date.now()){
                setToken(saved);
                setRole(payload.role||"");
                fetch(`${API}/auth/me`,{headers:ah(saved)})
                    .then((r)=>r.ok?r.json():null)
                    .then((d)=>{if(d)setUser(d);})
                    .catch(()=>{});
            }else{
                localStorage.removeItem("token");
            }
        }
    },[]);

    useEffect(()=>{
        if(token&&role){
            fetchRecords(1);
            refreshDashboard();
            if(isAdmin)fetchUsers();
        }
    },[token,role]); // eslint-disable-line

    useEffect(()=>{
        if(token)fetchRecords(1);
    },[filterType,filterCategory,filterFrom,filterTo,filterSearch]); // eslint-disable-line

    const openNew=()=>{
        setEditRecord(null);
        setForm(DEFAULT_FORM);
        resetRecordState();
        setShowRecordModal(true);
    };

    const openEdit=(rec)=>{
        setEditRecord(rec);
        setForm({
            amount:String(rec.amount),
            type:rec.type,
            category:rec.category,
            date:rec.date?.slice(0,10)??"",
            note:rec.note??"",
        });
        resetRecordState();
        setShowRecordModal(true);
    };

    const saveRecord=async()=>{
        resetRecordState();
        const amount=parseFloat(form.amount);
        if(!form.amount||isNaN(amount)||amount<=0)return setFormErr("Amount must be a positive number");
        if(!form.category.trim())return setFormErr("Category is required");
        if(!form.date)return setFormErr("Date is required");
        setFormLoading(true);
        try{
            const url=editRecord?`${API}/records/${editRecord._id}`:`${API}/records`;
            const method=editRecord?"PATCH":"POST";
            const {r,d}=await requestJson(url,{
                method,
                headers:ah(token),
                body:JSON.stringify({...form,amount}),
            });
            if(!r.ok)return setFormErr(d.msg||"Failed to save record");
            setFormOk(true);
            setTimeout(()=>{
                setShowRecordModal(false);
                setFormOk(false);
            },900);
            fetchRecords(recPage);
            refreshDashboard();
        }catch{
            setFormErr("Cannot reach server");
        }finally{
            setFormLoading(false);
        }
    };

    const deleteRecord=async(id)=>{
        if(!confirm("Delete this record?"))return;
        try{
            const {r}=await requestJson(`${API}/records/${id}`,{method:"DELETE",headers:ah(token)});
            if(r.ok){
                const newTotal=recTotal-1;
                const maxPage=Math.ceil(newTotal/10)||1;
                const targetPage=recPage>maxPage?maxPage:recPage;
                fetchRecords(targetPage);
                refreshDashboard();
            }
        }catch{}
    };

    const updateUser=async(id,update)=>{
        try{
            const {r}=await requestJson(`${API}/admin/users/${id}`,{
                method:"PATCH",
                headers:ah(token),
                body:JSON.stringify(update),
            });
            if(r.ok)fetchUsers();
        }catch{}
    };

    if(!token){
        return(
            <div className="auth-page">
                <div className="auth-bg"/>
                <div className="auth-card">
                    <div className="auth-logo">
                        <div className="auth-logo-mark">◈</div>
                        <span className="auth-logo-name">Zorvyn</span>
                    </div>

                    <h1 className="auth-heading">{isRegister?"Create account":"Welcome back"}</h1>
                    <p className="auth-sub">{isRegister?"A cleaner way to manage records, roles, and insights.":"Sign in to your finance dashboard."}</p>

                    <div className="fields">
                        {isRegister&&(
                            <div className="field">
                                <label className="field-label">Full name</label>
                                <input className="auth-input" placeholder="Your Name" value={name} onChange={(e)=>setName(e.target.value)}/>
                            </div>
                        )}

                        <div className="field">
                            <label className="field-label">Email address</label>
                            <input className="auth-input" type="email" placeholder="you@example.com" value={email} onChange={(e)=>setEmail(e.target.value)}/>
                        </div>

                        <div className="field">
                            <label className="field-label">Password</label>
                            <input className="auth-input" type="password" placeholder="Min. 6 characters" value={password} onChange={(e)=>setPassword(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter")isRegister?register():login();}}/>
                        </div>

                        {isRegister&&(
                            <div className="field">
                                <label className="field-label">Role secret <span className="tiny-note">(optional)</span></label>
                                <input className="auth-input" type="password" placeholder="Leave blank for viewer access" value={adminSecret} onChange={(e)=>setAdminSecret(e.target.value)}/>
                                <span className="field-hint">Enter your organisation secret for elevated access.</span>
                            </div>
                        )}
                    </div>

                    {authErr&&<div className="auth-error">{authErr}</div>}

                    <button className="auth-btn" onClick={isRegister?register:login} disabled={authLoading}>
                        {authLoading?"Please wait…":isRegister?"Create account":"Sign in"}
                    </button>

                    <p className="auth-toggle">
                        {isRegister?"Already have an account? ":"New here? "}
                        <button className="auth-toggle-link" onClick={()=>{setIsRegister(!isRegister);setAuthErr("");}}>
                            {isRegister?"Sign in":"Create account"}
                        </button>
                    </p>
                </div>
            </div>
        );
    }

    return(
        <>
            <div className="dash-root">
                <div className="dash-ambient"/>

                <nav className="nav">
                    <div className="nav-brand">
                        <div className="nav-mark">◈</div>
                        <span className="nav-name">Zorvyn</span>
                    </div>

                    <div className="nav-right">
                        {user&&(
                            <div className="nav-user-pill">
                                <div className="nav-avatar">{user.name?.[0]?.toUpperCase()}</div>
                                <span className="nav-uname">{user.name}</span>
                                <span className="nav-role" style={{color:roleColor,background:roleColor+"14",border:`1px solid ${roleColor}24`}}>{role}</span>
                            </div>
                        )}
                        <button className="sign-out" onClick={logout}>Sign out</button>
                    </div>
                </nav>

                <div className="tabs">
                    <button className={`tab-btn ${tab==="dashboard"?"active":""}`} onClick={()=>setTab("dashboard")}>Dashboard</button>
                    <button className={`tab-btn ${tab==="records"?"active":""}`} onClick={()=>setTab("records")}>
                        Records {recTotal>0&&<span className="tab-pill records-pill">{recTotal}</span>}
                    </button>
                    {isAdmin&&(
                        <button className={`tab-btn ${tab==="users"?"active":""}`} onClick={()=>{setTab("users");fetchUsers();}}>
                            Users {users.length>0&&<span className="tab-pill users-pill">{users.length}</span>}
                        </button>
                    )}
                </div>

                <main className="main">
                    {dashErr&&<div className="dash-err">{dashErr}</div>}

                    {tab==="dashboard"&&(
                        <>
                            <div className="ph">
                                <h1 className="ph-title">Financial <em>Overview</em></h1>
                                <p className="ph-sub">
                                    {isAdmin?"A complete, system-wide view of records, users, and performance.":role==="analyst"?"A focused summary of your records, trends, and recent activity.":"A clean, read-only view of your financial records."}
                                </p>
                            </div>

                            {isViewer&&(
                                <div className="viewer-notice">
                                    <span className="viewer-notice-text">
                                        You have <strong className="strong-text">viewer access</strong>. You can browse all financial records in the Records tab. Summary analytics are available to analysts and admins.
                                    </span>
                                </div>
                            )}

                            {summary&&!isViewer&&(
                                <div className="cards">
                                    <div className="card" style={{"--accent":"rgba(52,199,89,.28)"}}>
                                        <div className="card-ic income-bg">↑</div>
                                        <div className="clabel">Total Income</div>
                                        <div className="cval income-text">{fmt(summary.totalIncome)}</div>
                                    </div>

                                    <div className="card" style={{"--accent":"rgba(255,59,48,.24)"}}>
                                        <div className="card-ic expense-bg">↓</div>
                                        <div className="clabel">Total Expenses</div>
                                        <div className="cval expense-text">{fmt(summary.totalExpense)}</div>
                                    </div>

                                    <div className="card" style={{"--accent":"rgba(0,113,227,.24)"}}>
                                        <div className="card-ic balance-bg">◈</div>
                                        <div className="clabel">Net Balance</div>
                                        <div className="cval" style={{color:summary.netBalance>=0?"#0071e3":"#d93025"}}>{fmt(summary.netBalance)}</div>
                                    </div>
                                </div>
                            )}

                            {!isViewer&&(
                                <div className="analytics-row">
                                    <div className="analytics-card">
                                        <div className="a-label">Monthly Trends</div>
                                        <div className="trend-switches">
                                            <button className="page-btn" onClick={()=>fetchTrends("monthly")}>Monthly</button>
                                            <button className="page-btn" onClick={()=>fetchTrends("weekly")}>Weekly</button>
                                        </div>

                                        {trends.length>0?(
                                            <>
                                                <div className="trend-legend">
                                                    <div className="tl-item"><div className="tl-dot income-dot"/>Income</div>
                                                    <div className="tl-item"><div className="tl-dot expense-dot"/>Expense</div>
                                                </div>

                                                <TrendChart trends={trends}/>

                                                <div className="trend-summary">
                                                    {trends.slice(-3).reverse().map((t,i)=>(
                                                        <div key={i} className="trend-summary-row">
                                                            <span>{t.month?MONTHS[t.month-1]:`W${t.week}`}</span>
                                                            <span className="income-text">+{fmt(t.income)}</span>
                                                            <span className="expense-text">-{fmt(t.expense)}</span>
                                                            <span style={{color:t.income-t.expense>=0?"#0071e3":"#d93025"}}>{fmt(t.income-t.expense)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        ):(
                                            <div className="empty empty-small">
                                                <div className="empty-t">No trend data yet</div>
                                                <div className="empty-s">Add records to see monthly trends</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="analytics-card">
                                        <div className="a-label">Category Breakdown</div>

                                        {categoryData.length>0?(
                                            <>
                                                <DonutChart data={categoryData}/>
                                                <div className="category-summary">
                                                    {categoryData.slice(0,5).map((c,i)=>(
                                                        <div key={i} className="category-summary-row">
                                                            <span className="muted-text">{c._id}</span>
                                                            <span className="strong-text">{fmt(c.total)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        ):(
                                            <div className="empty empty-small">
                                                <div className="empty-t">No categories yet</div>
                                                <div className="empty-s">Add records to see breakdown</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!isViewer&&(
                                <div className="recent-wrap">
                                    <div className="sec-bar">
                                        <span className="sec-label">Recent Activity</span>
                                        <button className="primary-btn primary-btn-small" onClick={()=>setTab("records")}>View all →</button>
                                    </div>

                                    {recent.length>0?(
                                        <div className="rec-list">
                                            {recent.map((r)=>(
                                                <div className="rec-item" key={r._id}>
                                                    <div className="rec-dot" style={{background:r.type==="income"?"#34c759":"#ff3b30"}}/>
                                                    <span className="rec-cat">{r.category}</span>
                                                    <span className="rec-date">{fmtDate(r.date)}</span>
                                                    <span className="rec-amt" style={{color:r.type==="income"?"#248a3d":"#d93025"}}>
                                                        {r.type==="income"?"+":"-"}{fmt(r.amount)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ):(
                                        <div className="empty empty-small">
                                            <div className="empty-t">No recent activity</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {tab==="records"&&(
                        <>
                            <div className="ph">
                                <h1 className="ph-title">Financial <em>Records</em></h1>
                                <p className="ph-sub">{recTotal} record{recTotal!==1?"s":""} found</p>
                            </div>

                            <div className="filters">
                                <select className="fselect-sm" value={filterType} onChange={(e)=>setFilterType(e.target.value)}>
                                    <option value="">All types</option>
                                    <option value="income">Income</option>
                                    <option value="expense">Expense</option>
                                </select>

                                <input className="finput-sm" placeholder="Category…" value={filterCategory} onChange={(e)=>setFilterCategory(e.target.value)}/>
                                <input className="finput-sm" type="date" value={filterFrom} onChange={(e)=>setFilterFrom(e.target.value)} title="From date"/>
                                <input className="finput-sm" type="date" value={filterTo} onChange={(e)=>setFilterTo(e.target.value)} title="To date"/>
                                <input className="finput-sm search-input" placeholder="Search…" value={filterSearch} onChange={(e)=>setFilterSearch(e.target.value)}/>

                                {activeFilters&&<button className="filter-clear" onClick={clearFilters}>Clear</button>}

                                <div className="filters-right">
                                    {canWrite&&(
                                        <button className="primary-btn" onClick={openNew}>
                                            <span className="plus-icon">+</span> Add record
                                        </button>
                                    )}
                                </div>
                            </div>

                            {records.length===0?(
                                <div className="empty">
                                    <div className="empty-ic">◎</div>
                                    <div className="empty-t">No records found</div>
                                    <div className="empty-s">{canWrite?"Add your first record above":"Records will appear here once added by an admin or analyst"}</div>
                                </div>
                            ):(
                                <div className="tbl-wrap">
                                    <table className="tbl">
                                        <thead>
                                            <tr>
                                                <th>Amount</th>
                                                <th>Type</th>
                                                <th>Category</th>
                                                <th>Date</th>
                                                <th>Note</th>
                                                {canWrite&&<th className="right">Actions</th>}
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {records.map((r)=>(
                                                <tr key={r._id}>
                                                    <td className="amt" style={{color:r.type==="income"?"#248a3d":"#d93025"}}>
                                                        {r.type==="income"?"+":"-"}{fmt(r.amount)}
                                                    </td>
                                                    <td><span className={`pill ${r.type}`}><span className="pdot"/>{r.type}</span></td>
                                                    <td><span className="chip">{r.category}</span></td>
                                                    <td>{fmtDate(r.date)}</td>
                                                    <td className="note-cell">{r.note||<span className="dash-placeholder">—</span>}</td>
                                                    {canWrite&&(
                                                        <td className="right">
                                                            <div className="action-row">
                                                                <button className="icon-btn" title="Edit" onClick={()=>openEdit(r)}>✎</button>
                                                                <button className="icon-btn danger" title="Delete" onClick={()=>deleteRecord(r._id)}>✕</button>
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    {recPages>1&&(
                                        <div className="pagination">
                                            <span className="page-info">Page {recPage} of {recPages} · {recTotal} records</span>
                                            <div className="page-btns">
                                                <button className="page-btn" disabled={recPage<=1} onClick={()=>fetchRecords(recPage-1)}>← Prev</button>
                                                {pageNumbers.map((n)=>(
                                                    <button key={n} className={`page-btn ${n===recPage?"active":""}`} onClick={()=>fetchRecords(n)}>{n}</button>
                                                ))}
                                                <button className="page-btn" disabled={recPage>=recPages} onClick={()=>fetchRecords(recPage+1)}>Next →</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {tab==="users"&&isAdmin&&(
                        <>
                            <div className="ph">
                                <h1 className="ph-title">User <em>Management</em></h1>
                                <p className="ph-sub">{users.length} registered user{users.length!==1?"s":""}</p>
                            </div>

                            {users.length===0?(
                                <div className="empty">
                                    <div className="empty-ic">◎</div>
                                    <div className="empty-t">No users found</div>
                                </div>
                            ):(
                                <div className="tbl-wrap">
                                    <table className="tbl">
                                        <thead>
                                            <tr>
                                                <th>User</th>
                                                <th>Email</th>
                                                <th>Role</th>
                                                <th>Status</th>
                                                <th>Joined</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {users.map((u)=>(
                                                <tr key={u._id}>
                                                    <td>
                                                        <div className="user-row">
                                                            <div className="user-mini-avatar">{u.name?.[0]?.toUpperCase()}</div>
                                                            <span className="user-name">{u.name}</span>
                                                            {u._id===user?._id&&<span className="you-pill">you</span>}
                                                        </div>
                                                    </td>

                                                    <td className="muted-text">{u.email}</td>

                                                    <td>
                                                        <select className="role-select" value={u.role} disabled={u._id===user?._id} onChange={(e)=>updateUser(u._id,{role:e.target.value})}>
                                                            <option value="viewer">Viewer</option>
                                                            <option value="analyst">Analyst</option>
                                                            <option value="admin">Admin</option>
                                                        </select>
                                                    </td>

                                                    <td>
                                                        <button className={`status-toggle ${u.status}`} disabled={u._id===user?._id} onClick={()=>updateUser(u._id,{status:u.status==="active"?"inactive":"active"})}>
                                                            {u.status}
                                                        </button>
                                                    </td>

                                                    <td className="muted-text">{fmtDate(u.createdAt)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </main>
            </div>

            <Modal open={showRecordModal} title={editRecord?"Edit Record":"New Record"} onClose={()=>{setShowRecordModal(false);resetRecordState();}}>
                <div className="mfields">
                    <div className="mfield-row">
                        <div className="mfield">
                            <label className="mlbl">Amount</label>
                            <input className="minput" type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={(e)=>setForm({...form,amount:e.target.value})}/>
                        </div>

                        <div className="mfield">
                            <label className="mlbl">Type</label>
                            <select className="mselect" value={form.type} onChange={(e)=>setForm({...form,type:e.target.value})}>
                                <option value="income">Income</option>
                                <option value="expense">Expense</option>
                            </select>
                        </div>
                    </div>

                    <div className="mfield-row">
                        <div className="mfield">
                            <label className="mlbl">Category</label>
                            <input className="minput" placeholder="e.g. Salary" value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})}/>
                        </div>

                        <div className="mfield">
                            <label className="mlbl">Date</label>
                            <input className="minput" type="date" value={form.date} onChange={(e)=>setForm({...form,date:e.target.value})}/>
                        </div>
                    </div>

                    <div className="mfield">
                        <label className="mlbl">Note <span className="tiny-note">(optional)</span></label>
                        <input className="minput" placeholder="Description…" value={form.note} onChange={(e)=>setForm({...form,note:e.target.value})}/>
                    </div>
                </div>

                <div className="mactions">
                    <button className="msave" onClick={saveRecord} disabled={formLoading}>{formLoading?"Saving…":editRecord?"Save changes":"Create record"}</button>
                    <button className="mcancel" onClick={()=>{setShowRecordModal(false);resetRecordState();}}>Cancel</button>
                    {formErr&&<span className="merr">{formErr}</span>}
                    {formOk&&<span className="mok">✓ Saved</span>}
                </div>
            </Modal>
        </>
    );
}