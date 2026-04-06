import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";

dotenv.config();

const app=express();
const PORT=process.env.PORT||5000;
const APP_NAME=process.env.APP_NAME||"Finance API";
const MONGO_TIMEOUT=Number(process.env.MONGO_TIMEOUT)||5000;
const roles=["viewer","analyst","admin"];
const statuses=["active","inactive"];
const recordTypes=["income","expense"];
const safeUserFields="-password -__v";
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.use(express.json());
if(process.env.NODE_ENV!=="test")app.use(morgan("dev"));
app.use(cors({origin:process.env.CLIENT_ORIGIN||"http://localhost:3000"}));
app.get("/",(req,res)=>res.json({status:"ok",uptime:process.uptime()}));

// Schemas
const userSchema=new mongoose.Schema({
    name:{type:String,required:true,trim:true},
    email:{type:String,unique:true,required:true,lowercase:true,trim:true},
    password:{type:String,required:true},
    role:{type:String,enum:roles,default:"viewer"},
    status:{type:String,enum:statuses,default:"active"},
},{timestamps:true});

const recordSchema=new mongoose.Schema({
    user:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
    amount:{type:Number,required:true},
    type:{type:String,enum:recordTypes,required:true},
    category:{type:String,required:true,trim:true},
    date:{type:Date,required:true},
    note:{type:String,trim:true},
    // We soft-delete records so old reporting stays reconcilable.
    isDeleted:{type:Boolean,default:false},
},{timestamps:true});

recordSchema.index({isDeleted:1,user:1,date:-1});
recordSchema.index({isDeleted:1,date:-1});

const User=mongoose.model("User",userSchema);
const Record=mongoose.model("Record",recordSchema);

// Helpers
const normalizeEmail=(email="")=>email.toLowerCase().trim();
const toObjectId=(id)=>new mongoose.Types.ObjectId(id);
const isValidMongoId=(id)=>mongoose.Types.ObjectId.isValid(id);
const signToken=(payload)=>jwt.sign(payload,process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN||"7d"});

const safeUser=(user)=>{
    const raw=typeof user?.toObject==="function"?user.toObject():user;
    const {password,__v,...clean}=raw;
    return clean;
};

const parsePageParams=(page,limit)=>({
    page:Math.max(1,Number(page)||1),
    limit:Math.max(1,Number(limit)||10),
});

const buildDateFilter=(from,to)=>{
    if(!from&&!to)return undefined;
    const range={};
    if(from)range.$gte=new Date(from);
    if(to){
        // Including end of day for "to" date keeps the filter user-friendly.
        const endDate=new Date(to);
        endDate.setHours(23,59,59,999);
        range.$lte=endDate;
    }
    return range;
};

const makeTextSearch=(term)=>[
    {category:{$regex:term,$options:"i"}},
    {note:{$regex:term,$options:"i"}},
];

const getRecordFilterForUser=(currentUser)=>{
    const query={};
    query.isDeleted=false;
    if(currentUser.role==="analyst")query.user=toObjectId(currentUser.id);
    return query;
};

const getOwnedRecordFilter=(currentUser,extra={})=>{
    const query={...extra};
    if(currentUser.role!=="admin")query.user=toObjectId(currentUser.id);
    return query;
};

// Auth
// This runs on every protected route for now; easy future extract if the file grows.
const auth=async(req,res,next)=>{
    const token=req.headers.authorization?.split(" ")[1];
    if(!token)return res.status(401).json({msg:"No token provided"});
    try{
        const decoded=jwt.verify(token,process.env.JWT_SECRET);
        const user=await User.findById(decoded.id).select(safeUserFields).lean();
        if(!user)return res.status(401).json({msg:"User no longer exists"});
        if(user.status!=="active")return res.status(403).json({msg:"Account inactive"});
        req.user={
            id:user._id.toString(),
            role:user.role,
            status:user.status,
            name:user.name,
            email:user.email,
        };
        next();
    }catch(err){
        return res.status(401).json({msg:err.name==="TokenExpiredError"?"Token expired":"Invalid token"});
    }
};

const allowRoles=(...allowedRoles)=>(req,res,next)=>{
    if(!allowedRoles.includes(req.user.role))return res.status(403).json({msg:"Forbidden"});
    next();
};

// Validation
const validateRegister=(req,res,next)=>{
    const {name,email,password}=req.body;
    if(!name?.trim()||!email?.trim()||!password)return res.status(400).json({msg:"All fields required"});
    if(!emailPattern.test(email))return res.status(400).json({msg:"Invalid email format"});
    if(password.length<6)return res.status(400).json({msg:"Password must be at least 6 characters"});
    next();
};

const validateLogin=(req,res,next)=>{
    const {email,password}=req.body;
    if(!email?.trim()||!password)return res.status(400).json({msg:"Both Email and password required"});
    next();
};

const validateRecord=(req,res,next)=>{
    const {amount,type,category,date}=req.body;
    const parsedAmount=Number(amount);
    if(Number.isNaN(parsedAmount)||parsedAmount<=0)return res.status(400).json({msg:"amount must be positive number"});
    if(!recordTypes.includes(type))return res.status(400).json({msg:"type must be income or expense"});
    if(!category?.trim())return res.status(400).json({msg:"category required"});
    if(!date||Number.isNaN(new Date(date).getTime()))return res.status(400).json({msg:"Invalid date format"});
    next();
};

// Auth routes
app.post("/api/auth/register",validateRegister,async(req,res,next)=>{
    try{
        const {name,email,password,adminSecret}=req.body;
        const cleanEmail=normalizeEmail(email);
        const existingUser=await User.findOne({email:cleanEmail}).lean();
        if(existingUser)return res.status(409).json({msg:"Email already exists"});
        const hashedPassword=await bcrypt.hash(password,12);
        const isAdmin=adminSecret===process.env.ADMIN_SECRET;
        const isAnalyst=adminSecret===process.env.ANALYST_SECRET;
        const assignedRole=isAdmin?"admin":isAnalyst?"analyst":"viewer";
        const newUser=await User.create({
            name:name.trim(),
            email:cleanEmail,
            password:hashedPassword,
            role:assignedRole,
        });
        res.status(201).json(safeUser(newUser));
    }catch(err){
        next(err);
    }
});

app.post("/api/auth/login",validateLogin,async(req,res,next)=>{
    try{
        const {email,password}=req.body;
        const user=await User.findOne({email:normalizeEmail(email)}).lean();
        if(!user)return res.status(401).json({msg:"Invalid credentials"});
        if(user.status==="inactive")return res.status(403).json({msg:"Account inactive"});
        const passwordMatch=await bcrypt.compare(password,user.password);
        if(!passwordMatch)return res.status(401).json({msg:"Invalid credentials"});
        res.json({token:signToken({id:user._id,role:user.role}),user:safeUser(user)});
    }catch(err){
        next(err);
    }
});

app.get("/api/auth/me",auth,async(req,res,next)=>{
    try{
        const user=await User.findById(req.user.id).select(safeUserFields).lean();
        if(!user)return res.status(404).json({msg:"User not found"});
        res.json(user);
    }catch(err){
        next(err);
    }
});

// Record routes
app.post("/api/records",auth,allowRoles("analyst","admin"),validateRecord,async(req,res,next)=>{
    try{
        const newRecord=await Record.create({...req.body,amount:Number(req.body.amount),user:req.user.id});
        res.status(201).json(newRecord);
    }catch(err){
        next(err);
    }
});

app.get("/api/records",auth,async(req,res,next)=>{
    try{
        const {type,category,from,to,search}=req.query;
        const {page,limit}=parsePageParams(req.query.page,req.query.limit);
        const query=getRecordFilterForUser(req.user);

        if(type)query.type=type;

        if(search){
            query.$or=makeTextSearch(search);
        }else if(category){
            query.category={$regex:category,$options:"i"};
        }

        const dateRange=buildDateFilter(from,to);
        if(dateRange)query.date=dateRange;

        const [records,total]=await Promise.all([
            Record.find(query).sort({date:-1}).skip((page-1)*limit).limit(limit).lean(),
            Record.countDocuments(query),
        ]);

        res.json({data:records,page,totalPages:Math.ceil(total/limit),total});
    }catch(err){
        next(err);
    }
});

app.patch("/api/records/:id",auth,allowRoles("analyst","admin"),validateRecord,async(req,res,next)=>{
    try{
        if(!isValidMongoId(req.params.id))return res.status(400).json({msg:"Bad ID"});
        const query=getOwnedRecordFilter(req.user,{_id:req.params.id,isDeleted:false});
        const updates={...req.body};
        if(updates.amount!==undefined)updates.amount=Number(updates.amount);
        const updatedRecord=await Record.findOneAndUpdate(query,updates,{new:true});
        if(!updatedRecord)return res.status(404).json({msg:"Record not found"});
        res.json(updatedRecord);
    }catch(err){
        next(err);
    }
});

app.delete("/api/records/:id",auth,allowRoles("analyst","admin"),async(req,res,next)=>{
    try{
        if(!isValidMongoId(req.params.id))return res.status(400).json({msg:"Bad ID"});
        const query=getOwnedRecordFilter(req.user,{_id:req.params.id,isDeleted:false});
        const deletedRecord=await Record.findOneAndUpdate(query,{isDeleted:true},{new:true});
        if(!deletedRecord)return res.status(404).json({msg:"Record not found"});
        res.json({msg:"Deleted successfully",id:deletedRecord._id});
    }catch(err){
        next(err);
    }
});

// Dashboard routes
app.get("/api/dashboard/summary",auth,allowRoles("analyst","admin"),async(req,res,next)=>{
    try{
        const match=getOwnedRecordFilter(req.user,{isDeleted:false});
        const result=await Record.aggregate([
            {$match:match},
            // Grouping by type makes income/expense totals easy to compute later.
            {$group:{_id:"$type",total:{$sum:"$amount"}}},
        ]);
        let income=0;
        let expense=0;
        result.forEach((entry)=>{
            if(entry._id==="income")income=entry.total;
            if(entry._id==="expense")expense=entry.total;
        });
        res.json({totalIncome:income,totalExpense:expense,netBalance:income-expense});
    }catch(err){
        next(err);
    }
});

app.get("/api/dashboard/category",auth,allowRoles("analyst","admin"),async(req,res,next)=>{
    try{
        const match=getOwnedRecordFilter(req.user,{isDeleted:false});
        const categoryStats=await Record.aggregate([
            {$match:match},
            {$group:{_id:"$category",total:{$sum:"$amount"}}},
            {$sort:{total:-1}},
        ]);
        res.json(categoryStats);
    }catch(err){
        next(err);
    }
});

app.get("/api/dashboard/recent",auth,allowRoles("analyst","admin"),async(req,res,next)=>{
    try{
        const match=getOwnedRecordFilter(req.user,{isDeleted:false});
        const recentRecords=await Record.find(match).sort({date:-1}).limit(5).select("-isDeleted").lean();
        res.json(recentRecords);
    }catch(err){
        next(err);
    }
});

app.get("/api/dashboard/trends",auth,allowRoles("analyst","admin"),async(req,res,next)=>{
    try{
        const {from,to,groupBy="monthly"}=req.query;
        const match=getOwnedRecordFilter(req.user,{isDeleted:false});
        const dateRange=buildDateFilter(from,to);
        if(dateRange)match.date=dateRange;

        const groupKey=groupBy==="weekly"
            ? {year:{$year:"$date"},week:{$week:"$date"},type:"$type"}
            : {year:{$year:"$date"},month:{$month:"$date"},type:"$type"};

        const trendRows=await Record.aggregate([
            {$match:match},
            {$group:{_id:groupKey,total:{$sum:"$amount"}}},
        ]);

        const grouped={};
        trendRows.forEach((entry)=>{
            const key=groupBy==="weekly"
                ? `${entry._id.year}-W${entry._id.week}`
                : `${entry._id.year}-${String(entry._id.month).padStart(2,"0")}`;

            if(!grouped[key]){
                grouped[key]={
                    period:key,
                    income:0,
                    expense:0,
                    year:entry._id.year,
                    month:entry._id.month||null,
                    week:entry._id.week||null,
                };
            }

            grouped[key][entry._id.type]=entry.total;
        });

        const sorted=Object.values(grouped).sort((a,b)=>{
            if(groupBy==="weekly"){
                const [aYear,aWeek]=a.period.split("-W").map(Number);
                const [bYear,bWeek]=b.period.split("-W").map(Number);
                if(aYear!==bYear)return bYear-aYear;
                return bWeek-aWeek;
            }
            const [aYear,aMonth]=a.period.split("-").map(Number);
            const [bYear,bMonth]=b.period.split("-").map(Number);
            if(aYear!==bYear)return bYear-aYear;
            return bMonth-aMonth;
        });

        res.json(sorted.map((entry)=>({...entry,month:entry.month,week:entry.week})));
    }catch(err){
        next(err);
    }
});

// Admin routes
app.get("/api/admin/users",auth,allowRoles("admin"),async(req,res,next)=>{
    try{
        const allUsers=await User.find({},safeUserFields).sort({createdAt:-1}).lean();
        res.json(allUsers);
    }catch(err){
        next(err);
    }
});

app.patch("/api/admin/users/:id",auth,allowRoles("admin"),async(req,res,next)=>{
    try{
        if(!isValidMongoId(req.params.id))return res.status(400).json({msg:"Bad ID"});
        const {role,status}=req.body;
        const updates={};

        if(req.params.id===req.user.id)return res.status(400).json({msg:"Can't modify your own account"});

        if(role){
            if(!roles.includes(role))return res.status(400).json({msg:"Role must be viewer, analyst, or admin"});
            updates.role=role;
        }

        if(status){
            if(!statuses.includes(status))return res.status(400).json({msg:"Status must be active or inactive"});
            updates.status=status;
        }

        const updatedUser=await User.findByIdAndUpdate(req.params.id,updates,{new:true}).select(safeUserFields);
        if(!updatedUser)return res.status(404).json({msg:"User not found"});
        res.json(updatedUser);
    }catch(err){
        next(err);
    }
});

// Fallbacks
app.use((req,res)=>res.status(404).json({msg:"Not found"}));

app.use((err,req,res,next)=>{
    console.error(err);

    if(err.code===11000){
        const field=Object.keys(err.keyPattern)[0]||"field";
        return res.status(409).json({msg:`${field} already taken`});
    }

    if(err.name==="ValidationError"){
        const errors=Object.values(err.errors).map((e)=>e.message);
        return res.status(400).json({msg:errors.join("; ")});
    }

    if(err.name==="CastError")return res.status(400).json({msg:"Bad ID"});
    res.status(500).json({msg:"Server error"});
});

// Start server
const startServer=async()=>{
    try{
        await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:5000});
        console.log("MongoDB Is connected");

        app.listen(process.env.PORT || PORT, "0.0.0.0", () =>
            console.log(`Server running on port : ${process.env.PORT || PORT}`)
        );

    }catch(err){
        console.error("Error:",err);
        process.exit(1);
    }
};

startServer();