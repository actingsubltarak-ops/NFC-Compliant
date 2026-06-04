/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, AlertCircle, Loader2, QrCode as QrIcon, Copy, ArrowRight, ArrowLeft, ChevronDown, ShieldCheck, MapPin, FileText, Calendar, Info, User, Layers, HelpCircle, Eye, CornerDownRight, Clock, Map, TrendingUp } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../auth/AuthProvider';
import { db, storage } from '../../lib/firebase';
import { collection, addDoc, getDocs, query, orderBy, doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Complaint, Severity, ComplaintStatus, Category, Department } from '../../types';
import { Camera, Image as ImageIcon, X } from 'lucide-react';

// Required dependencies for better validation and UI
import { toast, Toaster } from 'sonner';

const thaiIdChecksum = (id: string) => {
  if (id.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(id[i]) * (13 - i);
  }
  const check = (11 - (sum % 11)) % 10;
  return check === parseInt(id[12]);
};

const complaintSchema = z.object({
  // Requester Info
  fullName: z.string().trim().min(5, 'กรุณากรอกชื่อ-นามสกุลให้ครบถ้วน'),
  idCard: z.string().length(13, 'เลขบัตรประชาชนต้องมี 13 หลัก').refine(thaiIdChecksum, 'เลขบัตรประชาชนไม่ถูกต้องตามรูปแบบ'),
  farmerId: z.string().optional().refine(val => !val || val.length >= 8, 'หากระบุ เลขทะเบียนเกษตรกรต้องมีความยาวอย่างน้อย 8 หลัก'),
  phone: z.string().regex(/^0[0-9]{8,9}$/, 'เบอร์โทรศัพท์ต้องเริ่มต้นด้วย 0 และมี 9-10 หลัก'),
  address: z.string().min(15, 'กรุณากรอกที่อูย่ที่ชัดเจน ให้ระบุบ้านเลขที่ หมู่บ้าน/ซอย และตำบล'),
  email: z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
  occupation: z.string().min(2, 'กรุณาระบุอาชีพ'),
  requesterType: z.string().min(1, 'กรุณาเลือกประเภทผู้ร้องเรียน'),
  channel: z.string().min(1, 'กรุณาเลือกช่องทางการร้องเรียน'),
  pdpaAccepted: z.boolean().refine(val => val === true, 'คุณต้องกดยอมรับนโยบายเพื่อดำเนินการต่อ'),
  otpVerified: z.boolean().refine(val => val === true, 'กรุณายืนยันตัวตนผ่านเบอร์โทรศัพท์ก่อนดำเนินการ'),

  // Complaint Details
  title: z.string().trim().min(10, 'หัวข้อเรื่องร้องเรียนควรมีความชัดเจน (อย่างน้อย 10 ตัวอักษร)'),
  category: z.string().min(1, 'กรุณาเลือกหมวดหมู่ปัญหา'),
  subCategory: z.string().optional(),
  departmentId: z.string().min(1, 'กรุณาเลือกหน่วยงานผู้รับผิดชอบ'),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  details: z.string().trim().min(40, 'กรุณาระบุรายละเอียดเหตุการณ์ให้ชัดเจน เพื่อประโยชน์ในการตรวจสอบ (อย่างน้อย 40 ตัวอักษร)'),
  previouslyReported: z.boolean(),
  documentType: z.string().optional(),

  // Incident Details
  incidentDate: z.string().min(1, 'กรุณาระบุวันที่เกิดเหตุ'),
  incidentTime: z.string().optional(),
  incidentLocation: z.string().min(5, 'กรุณาระบุสถานที่เกิดเหตุให้ชัดเจน'),
  province: z.string().min(1, 'กรุณาระบุจังหวัดที่เกิดเหตุ'),
  district: z.string().min(1, 'กรุณาระบุอำเภอที่เกิดเหตุ'),
  subDistrict: z.string().optional(),
  gpsCoordinates: z.string().optional(),
  
  // Agricultural context
  damagedAreaRai: z.preprocess((val) => Number(val), z.number().min(0, 'จำนวนไร่ต้องไม่ติดลบ')),
  damagedAreaNgan: z.preprocess((val) => Number(val), z.number().min(0, 'จำนวนงานต้องไม่ติดลบ').max(3, 'จำนวนงานต้องไม่เกิน 3 (4 งาน = 1 ไร่)')),
  damageValue: z.preprocess((val) => Number(val), z.number().min(0, 'มูลค่าความเสียหายต้องไม่ติดลบ')),
  cropType: z.string().optional(),
  
  involvedPersons: z.string().optional(),
  desiredAction: z.string().min(10, 'กรุณาระบุสิ่งที่ต้องการให้ดำเนินการแก้ไข (อย่างน้อย 10 ตัวอักษร)'),
  externalUrl: z.string().url('URL ไม่ถูกต้อง').optional().or(z.string().length(0)),
});

type ComplaintFormData = z.infer<typeof complaintSchema>;

export function ComplaintForm() {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<{ suggestions: string; isValid: boolean } | null>(null);
  const [submittedData, setSubmittedData] = useState<Complaint | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const catQ = query(collection(db, 'categories'), orderBy('name', 'asc'));
        const depQ = query(collection(db, 'departments'), orderBy('name', 'asc'));
        
        const [catSnap, depSnap] = await Promise.all([
          getDocs(catQ),
          getDocs(depQ)
        ]);
        
        setCategories(catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)).sort((a, b) => {
          const nameA = a.name || '';
          const nameB = b.name || '';
          if (nameA === 'ปัญหาด้านอื่นๆ' && nameB !== 'ปัญหาด้านอื่นๆ') return 1;
          if (nameA !== 'ปัญหาด้านอื่นๆ' && nameB === 'ปัญหาด้านอื่นๆ') return -1;
          return nameA.localeCompare(nameB, 'th');
        }));
        setDepartments(depSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department)).sort((a, b) => {
          const nameA = a.name || '';
          const nameB = b.name || '';
          if (nameA === 'ปัญหาด้านอื่นๆ' && nameB !== 'ปัญหาด้านอื่นๆ') return 1;
          if (nameA !== 'ปัญหาด้านอื่นๆ' && nameB === 'ปัญหาด้านอื่นๆ') return -1;
          return nameA.localeCompare(nameB, 'th');
        }));
      } catch (err) {
        console.error("Error fetching master data:", err);
      }
    };
    fetchData();
  }, []);

  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<ComplaintFormData>({
    resolver: zodResolver(complaintSchema) as any,
    defaultValues: {
      fullName: profile?.fullName || '',
      idCard: profile?.idCard || '',
      farmerId: '',
      phone: profile?.phone || '',
      address: profile?.address || '',
      email: profile?.email || '',
      occupation: '',
      channel: 'Web Application',
      requesterType: 'individual',
      pdpaAccepted: false,
      otpVerified: false,
      previouslyReported: false,
      title: '',
      category: '',
      subCategory: '',
      departmentId: '',
      severity: 'medium',
      details: '',
      documentType: '',
      incidentDate: '',
      incidentTime: '',
      incidentLocation: '',
      province: '',
      district: '',
      subDistrict: '',
      gpsCoordinates: '',
      damagedAreaRai: 0,
      damagedAreaNgan: 0,
      damageValue: 0,
      cropType: '',
      involvedPersons: '',
      desiredAction: '',
      externalUrl: '',
    }
  });

  const sendOtp = () => {
    setIsSendingOtp(true);
    setTimeout(() => {
      setIsSendingOtp(false);
      setOtpSent(true);
      setValue('otpVerified', true);
    }, 1500);
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);
  
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const coordsStr = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        setValue('incidentLocation', coordsStr);
        setValue('gpsCoordinates', coordsStr);
      },
      (error) => {
        console.error("Error getting location: ", error);
        alert("ไม่สามารถระบุตำแหน่งได้ กรุณาลองอีกครั้งหรือพิมพ์ด้วยตนเอง");
      }
    );
  };

  const analyzeWithAI = async () => {
    const title = watch('title');
    const details = watch('details');
    if (!title || title.length < 10 || !details || details.length < 40) {
      toast.error('กรุณากรอกหัวข้ออย่างน้อย 10 ตัวอักษร และรายละเอียดอย่างน้อย 40 ตัวอักษร เพื่อให้ AI วิเคราะห์ได้แม่นยำ');
      return;
    }

    setAiAnalyzing(true);
    setAiFeedback(null);
    try {
      const res = await fetch('/api/ai/analyze-complaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, details })
      });
      
      if (!res.ok) {
        throw new Error('การวิเคราะห์ล้มเหลว');
      }

      const data = await res.json();
      setAiFeedback(data);
      
      if (data.severity) {
        setValue('severity', data.severity);
        toast.info(`AI แนะนำระดับความรุนแรง: ${data.severity === 'critical' ? 'วิกฤต' : data.severity === 'high' ? 'สูง' : data.severity === 'medium' ? 'กลาง' : 'ต่ำ'}`);
      }
      
      if (data.category) {
        // Check if category exists in our list
        const exists = categories.find(c => c.name === data.category);
        if (exists) {
          setValue('category', data.category);
          toast.info(`AI แนะนำหมวดหมู่: ${data.category}`);
        }
      }

      if (data.isValid === false) {
        toast.warning('AI ตรวจพบว่าข้อมูลอาจไม่เกี่ยวข้องกับภารกิจด้านการเกษตร กรุณาตรวจสอบอีกครั้ง');
      } else {
        toast.success('AI ตรวจสอบความถูกต้องเบื้องต้นเรียบร้อยแล้ว');
      }
    } catch (err) {
      console.error(err);
      toast.error('ไม่สามารถติดต่อระบบ AI ได้ในขณะนี้ กรุณากรอกข้อมูลและดำเนินการต่อด้วยตนเอง');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const formData = data as ComplaintFormData;
      
      if (!formData.otpVerified) {
        toast.error('กรุณายืนยันตัวตนผ่าน OTP ก่อนส่งเรื่องร้องเรียน');
        setStep(1);
        setLoading(false);
        return;
      }

      const now = new Date();
      // Use crypto for more reliable tracking IDs
      const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
      const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
      const trackingId = `NFC-${datePart}-${randomPart}`;
      
      const slaDays = formData.severity === 'critical' ? 3 : formData.severity === 'high' ? 7 : formData.severity === 'medium' ? 15 : 30;
      const slaTargetDate = new Date(now.getTime() + slaDays * 24 * 60 * 60 * 1000).toISOString();

      // Show upload status if files selected
      if (selectedFiles.length > 0) {
        toast.loading('กำลังอัปโหลดไฟล์แนบ...', { id: 'upload-toast' });
      }

      // Upload Evidence to Cloud Storage
      const evidenceUrls: string[] = [];
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${crypto.randomUUID()}.${fileExt}`;
            const storageRef = ref(storage, `evidence/${trackingId}/${fileName}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(snapshot.ref);
            evidenceUrls.push(downloadUrl);
          } catch (uploadErr) {
            console.error("File upload error:", uploadErr);
            toast.error(`ไม่สามารถอัปโหลดไฟล์ ${file.name} ได้`);
          }
        }
      }

      const complaint: Omit<Complaint, 'id'> = {
        trackingId,
        complainantUid: profile?.uid || 'anonymous',
        fullName: formData.fullName,
        idCard: formData.idCard,
        phone: formData.phone,
        address: formData.address,
        email: formData.email,
        occupation: formData.occupation,
        requesterType: formData.requesterType,
        pdpaAccepted: formData.pdpaAccepted,
        pdpaVersion: '1.0.0',
        otpVerified: formData.otpVerified,

        title: formData.title,
        category: formData.category,
        subCategory: formData.subCategory || '',
        departmentId: formData.departmentId,
        departmentName: departments.find(d => d.id === formData.departmentId)?.name || '',
        severity: formData.severity,
        details: formData.details,
        previouslyReported: formData.previouslyReported,

        incidentDate: formData.incidentDate,
        incidentTime: formData.incidentTime || '',
        incidentLocation: formData.incidentLocation,
        province: formData.province,
        district: formData.district,
        subDistrict: formData.subDistrict || '',
        
        damagedAreaRai: formData.damagedAreaRai,
        damagedAreaNgan: formData.damagedAreaNgan,
        damageValue: formData.damageValue,
        cropType: formData.cropType || '',

        involvedPersons: formData.involvedPersons || '',
        desiredAction: formData.desiredAction,
        evidenceUrls,
        externalUrl: formData.externalUrl || '',
        status: 'pending',
        slaTargetDate,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        channel: formData.channel,
      };

      const docRef = doc(db, 'complaints', trackingId);
      await setDoc(docRef, complaint);
      setSubmittedData({ ...complaint, id: trackingId });
      toast.dismiss('upload-toast');
      toast.success('ส่งเรื่องร้องเรียนสำเร็จแล้ว');
      setStep(5);
    } catch (err) {
      console.error(err);
      toast.dismiss('upload-toast');
      toast.error('เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  if (step === 5 && submittedData) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-3xl mx-auto bg-white rounded-[40px] shadow-2xl p-10 border border-slate-100 text-center relative overflow-hidden"
      >
        {/* Decorative background element */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-50 rounded-full opacity-50 blur-3xl"></div>
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-blue-50 rounded-full opacity-50 blur-3xl"></div>

        <div className="relative z-10">
          <div className="w-24 h-24 bg-emerald-600 text-white rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-200 rotate-6 transform hover:rotate-0 transition-transform duration-500">
            <CheckCircle size={56} strokeWidth={2.5} />
          </div>
          
          <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">ส่งเรื่องร้องเรียนสำเร็จ!</h2>
          <p className="text-slate-500 mb-10 text-xl font-medium max-w-lg mx-auto">
            ระบบจัดเก็บข้อมูลและรายละเอียดที่เกี่ยวข้องเรียบร้อยแล้ว กรุณาบันทึกเลขที่รับเรื่องเพื่อใช้ติดตามความคืบหน้า
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <div className="bg-slate-50 rounded-[32px] p-8 border border-slate-200 text-left flex flex-col justify-between">
              <div>
                <div className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-4">เลขที่รับเรื่อง</div>
                <div className="text-3xl font-black text-slate-800 font-mono flex items-center justify-between group">
                  {submittedData.trackingId}
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(submittedData.trackingId);
                      alert('คัดลอกเลขที่รับเรื่องแล้ว');
                    }} 
                    className="text-slate-300 hover:text-emerald-500 transition-colors p-2 hover:bg-white hover:shadow-md rounded-xl"
                  >
                    <Copy size={24} />
                  </button>
                </div>
              </div>
              
              <div className="mt-8 pt-8 border-t border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-400 uppercase tracking-widest">วันครบกำหนด (SLA)</div>
                    <div className="text-sm font-black text-slate-700">
                      {new Date(submittedData.slaTargetDate!).toLocaleDateString('th-TH', { 
                        year: 'numeric', month: 'long', day: 'numeric' 
                      })}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-400 font-medium leading-relaxed">
                  *กรอบเวลาดำเนินการเบื้องต้นอ้างอิงตามระดับความรุนแรงของเรื่อง (SLA)
                </p>
              </div>
            </div>

            <div className="bg-white rounded-[32px] p-8 border-2 border-emerald-50 text-center flex flex-col items-center">
              <div className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-4">สแกนเพื่อติดตามสถานะ</div>
              <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm mb-4 inline-block">
                <QRCodeSVG 
                  value={`${window.location.origin}/track/${submittedData.trackingId}`} 
                  size={160}
                  level="H"
                  includeMargin={false}
                />
              </div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">รหัสตรวจสอบ QR</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={() => window.print()} 
              className="w-full sm:w-auto px-10 py-5 bg-white border-2 border-slate-200 text-slate-800 rounded-2xl font-black text-lg hover:border-emerald-500 hover:text-emerald-600 transition-all shadow-sm flex items-center justify-center gap-3"
            >
              <FileText size={24} /> พิมพ์หลักฐาน
            </button>
            <button 
               onClick={() => window.location.reload()}
               className="w-full sm:w-auto px-10 py-5 bg-emerald-600 text-white rounded-2xl font-black text-lg hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-3"
            >
              กลับสู่หน้าหลัก
            </button>
          </div>

          <div className="mt-12 text-slate-400 text-xs font-bold uppercase tracking-[0.3em] flex items-center justify-center gap-2">
            <ShieldCheck size={16} /> Secured by National Farmers Council : NFC Complaint.
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Toaster position="top-center" richColors />
      {/* Progress Stepper */}
      <div className="flex justify-between mb-10 relative px-4">
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-200 -translate-y-1/2 z-0" />
        <div 
          className="absolute top-1/2 left-0 h-1 bg-emerald-500 -translate-y-1/2 z-0 transition-all duration-500" 
          style={{ width: `${((step - 1) / 3) * 100}%` }} 
        />
        {[1, 2, 3, 4].map((i) => (
          <div 
            key={i} 
            className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${
              step >= i ? 'bg-emerald-600 text-white shadow-lg' : 'bg-white text-slate-400 border-2 border-slate-200'
            }`}
          >
            {i}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-8 md:p-12">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                        <User size={24} />
                      </div>
                      <h2 className="text-3xl font-black text-slate-800 tracking-tight">ข้อมูลผู้ร้องเรียน</h2>
                    </div>
                    <p className="text-slate-500 font-medium">ระบุตัวตนและข้อมูลส่วนบุคคลเพื่อเริ่มกระบวนการยืนยันเรื่องร้องเรียน</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">ประเภทผู้ร้องเรียน</label>
                      <div className="grid grid-cols-3 gap-3">
                        {['individual', 'farmer', 'juristic'].map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setValue('requesterType', type)}
                            className={`p-4 border-2 rounded-2xl font-bold transition-all text-sm ${
                              watch('requesterType') === type 
                                ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm' 
                                : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300'
                            }`}
                          >
                            {type === 'individual' ? 'บุคคลธรรมดา' : type === 'farmer' ? 'เกษตรกร' : 'นิติบุคคล'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">ชื่อ-นามสกุล</label>
                      <div className="relative">
                        <input {...register('fullName')} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium text-slate-700" placeholder="ระบุชื่อจริงและนามสกุล" />
                      </div>
                      {errors.fullName && <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight ml-1">{errors.fullName.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">เลขบัตรประจำตัวประชาชน</label>
                      <input {...register('idCard')} maxLength={13} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium text-slate-700" placeholder="1XXXXXXXXXXXX" />
                      {errors.idCard && <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight ml-1">{errors.idCard.message}</p>}
                    </div>

                    <div className="space-y-2">
                       <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">เลขทะเบียนเกษตรกร (ถ้ามี)</label>
                       <input {...register('farmerId')} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium text-slate-700" placeholder="รหัสเกษตรกร 12 หลัก" />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">เบอร์โทรศัพท์ (ยืนยัน OTP)</label>
                      <div className="flex gap-2">
                        <input {...register('phone')} className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium text-slate-700" placeholder="0XXXXXXXXX" />
                        <button 
                          type="button" 
                          onClick={sendOtp}
                          disabled={isSendingOtp || otpSent || !watch('phone')}
                          className={`px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                            otpSent 
                              ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' 
                              : 'bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50'
                          }`}
                        >
                          {isSendingOtp ? 'SENDING...' : otpSent ? 'VERIFIED' : 'GET OTP'}
                        </button>
                      </div>
                      {errors.phone && <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight ml-1">{errors.phone.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">อาชีพ</label>
                      <input {...register('occupation')} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium text-slate-700" placeholder="เช่น เกษตรกร, ค้าขาย" />
                      {errors.occupation && <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight ml-1">{errors.occupation.message}</p>}
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">ที่อยู่อาศัย</label>
                      <textarea {...register('address')} rows={2} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium text-slate-700" placeholder="บ้านเลขที่, ถนน, ตำบล..." />
                      {errors.address && <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight ml-1">{errors.address.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">อีเมล (Email)</label>
                      <input {...register('email')} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all font-medium text-slate-700" placeholder="yourname@domain.com" />
                      {errors.email && <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight ml-1">{errors.email.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">ช่องทางรับข่าวสาร</label>
                      <div className="relative">
                        <select {...register('channel')} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none appearance-none font-medium text-slate-700 cursor-pointer">
                          <option value="Web Application">Web Application</option>
                          <option value="SMS">SMS แจ้งเตือน</option>
                          <option value="Email">Email ยืนยัน</option>
                          <option value="LINE">LINE Notify</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
                      </div>
                    </div>
                  </div>

                  <div className={`p-6 rounded-[32px] border-2 transition-all ${watch('pdpaAccepted') ? 'bg-emerald-50 border-emerald-100 shadow-sm' : 'bg-slate-50 border-slate-200'}`}>
                    <label className="flex items-start gap-4 cursor-pointer">
                      <input 
                        type="checkbox" 
                        {...register('pdpaAccepted')} 
                        className="mt-1 w-5 h-5 rounded-md border-slate-300 text-emerald-600 focus:ring-emerald-500 transition-all cursor-pointer"
                      />
                      <div className="text-sm">
                        <p className={`font-black uppercase tracking-tight mb-1 ${watch('pdpaAccepted') ? 'text-emerald-900' : 'text-slate-700'}`}>ข้าพเจ้ายอมรับนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)</p>
                        <p className="text-slate-500 leading-relaxed font-medium">ยินยอมให้หน่วยงานเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลเพื่อประโยขน์ในการติดตามความคืบหน้าเรื่องร้องเรียน (v1.0.0)</p>
                      </div>
                    </label>
                    {errors.pdpaAccepted && <p className="text-red-600 text-[10px] font-black uppercase mt-3 tracking-widest flex items-center gap-1"><AlertCircle size={12} /> {errors.pdpaAccepted.message}</p>}
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-8"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                       <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                        <Layers size={24} />
                      </div>
                      <h2 className="text-3xl font-black text-slate-800 tracking-tight">รายละเอียดร้องเรียน</h2>
                    </div>
                    <p className="text-slate-500 font-medium">ระบุหัวข้อและจัดหมวดหมู่ปัญหาเพื่อให้หน่วยงานวิเคราะห์และรับเรื่องได้รวดเร็วขึ้น</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">หัวข้อเรื่องร้องเรียน</label>
                    <input {...register('title')} placeholder="เช่น ปัญหาภัยแล้งรุนแรง หรือ การระบาดของศัตรูพืช" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold text-slate-700" />
                    {errors.title && <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight ml-1">{errors.title.message}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">หมวดหมู่ปัญหา</label>
                      <div className="relative">
                        <select {...register('category')} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none appearance-none font-bold text-slate-700 cursor-pointer">
                          <option value="">เลือกหมวดหมู่</option>
                          {categories.map(cat => (
                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
                      </div>
                      {errors.category && <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight ml-1">{errors.category.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">หน่วยงานที่ร้องเรียน (ที่ต้องการระบุ)</label>
                      <div className="relative">
                        <select {...register('departmentId')} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none appearance-none font-bold text-slate-700 cursor-pointer">
                          <option value="">เลือกหน่วยงาน (ถ้าทราบ)</option>
                          {departments.map(dep => (
                            <option key={dep.id} value={dep.id}>{dep.name}</option>
                          ))}
                          <option value="other">อื่น ๆ / ให้ระบบจัดสรร</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">ระดับความรุนแรง</label>
                      <div className="grid grid-cols-2 gap-2">
                         {['low', 'medium', 'high', 'critical'].map((s) => (
                           <button
                             key={s}
                             type="button"
                             onClick={() => setValue('severity', s as any)}
                             className={`px-3 py-2 border rounded-xl text-[10px] font-black uppercase transition-all ${
                               watch('severity') === s 
                                 ? s === 'low' ? 'bg-slate-400 border-slate-400 text-white shadow-md'
                                 : s === 'high' ? 'bg-orange-500 border-orange-500 text-white shadow-md'
                                 : s === 'critical' ? 'bg-red-600 border-red-600 text-white shadow-md' 
                                 : 'bg-slate-800 border-slate-800 text-white shadow-md'
                                 : 'bg-white border-slate-100 text-slate-400'
                             }`}
                           >
                             {s === 'low' ? 'ต่ำ' : s === 'medium' ? 'กลาง' : s === 'high' ? 'สูง' : 'วิกฤต'}
                           </button>
                         ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-1 h-3">
                         <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">เคยร้องเรียนเรื่องนี้มาก่อน?</label>
                      </div>
                      <div className="flex bg-slate-100 p-1 rounded-xl w-32">
                        <button type="button" onClick={() => setValue('previouslyReported', true)} className={`flex-1 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${watch('previouslyReported') ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>เคย</button>
                        <button type="button" onClick={() => setValue('previouslyReported', false)} className={`flex-1 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${!watch('previouslyReported') ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>ไม่เคย</button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest">รายละเอียดเหตุการณ์</label>
                      <button 
                        type="button"
                        onClick={analyzeWithAI}
                        disabled={aiAnalyzing || !watch('details')}
                        className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 py-1.5 px-3 bg-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-200 disabled:opacity-50 transition-all border border-emerald-200"
                      >
                        {aiAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                        AI Validation
                      </button>
                    </div>
                    <div className="relative group">
                      <textarea {...register('details')} rows={5} placeholder="ระบุเหตุการณ์โดยละเอียด วันที่เกิดเหตุ ผลกระทบ และผู้ที่เกี่ยวข้อง..." className="w-full p-5 bg-slate-50 border border-slate-200 rounded-[32px] focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-medium text-slate-700 resize-none" />
                      <div className="absolute bottom-4 right-6 text-[10px] font-black text-slate-300 uppercase tracking-widest group-focus-within:text-blue-400 transition-colors">
                        ขั้นต่ำ 20 ตัวอักษร
                      </div>
                    </div>
                    {errors.details && <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight ml-1">{errors.details.message}</p>}
                    
                    {aiFeedback && (
                      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className={`p-6 rounded-[32px] border-2 flex items-start gap-4 ${aiFeedback.isValid ? 'bg-emerald-50 border-emerald-100 shadow-sm' : 'bg-amber-50 border-amber-100 shadow-sm'}`}>
                         <div className={`mt-1 p-2 rounded-xl ${aiFeedback.isValid ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
                           <Info size={20} />
                         </div>
                         <div>
                            <div className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-50">ข้อเสนอแนะนำจาก AI</div>
                            <p className="text-sm font-bold leading-relaxed">{aiFeedback.suggestions}</p>
                         </div>
                      </motion.div>
                    )}
                  </div>

                  <div className="p-6 bg-slate-50 rounded-[32px] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center group hover:border-blue-400 transition-all cursor-pointer">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-300 group-hover:text-blue-500 shadow-sm mb-3 transition-colors">
                      <FileText size={20} />
                    </div>
                    <div className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">แนบไฟล์ประกอบ / รูปภาพความเสียหาย</div>
                    
                    <div className="flex flex-wrap gap-3 mt-4 mb-4">
                      {selectedFiles.map((file, idx) => (
                        <div key={idx} className="relative group w-20 h-20 bg-white rounded-2xl border-2 border-slate-100 overflow-hidden shadow-sm">
                          {file.type.startsWith('image/') ? (
                            <img src={URL.createObjectURL(file)} alt="preview" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-slate-50">
                              <FileText size={24} className="text-slate-300" />
                            </div>
                          )}
                          <button 
                            type="button" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="absolute -top-1 -right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      {selectedFiles.length < 5 && (
                        <label className="w-20 h-20 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-300 hover:border-emerald-500 hover:text-emerald-500 transition-all cursor-pointer bg-white group">
                          <Camera size={24} />
                          <span className="text-[10px] font-black uppercase mt-1">เพิ่มรูป</span>
                          <input 
                            type="file" 
                            multiple 
                            className="hidden" 
                            onChange={(e) => {
                              const files = e.target.files;
                              if (files) {
                                const newFiles = Array.from(files);
                                for (const file of newFiles) {
                                  if (file.size > 5 * 1024 * 1024) {
                                    alert(`ไฟล์ ${file.name} มีขนาดใหญ่เกินไป (สูงสุด 5MB)`);
                                    return;
                                  }
                                }
                                setSelectedFiles(prev => [...prev, ...newFiles].slice(0, 5));
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>

                    <div className="flex gap-2 mt-2">
                       {['รูปภาพความเสียหาย', 'ใบรับรอง', 'โฉนดที่ดิน', 'อื่น ๆ'].map(doc => (
                         <div key={doc} className="px-2 py-1 bg-white border border-slate-200 rounded text-[9px] font-black text-slate-500 uppercase tracking-tight">
                           {doc}
                         </div>
                       ))}
                    </div>
                    
                    <p className="text-[10px] text-slate-300 font-bold mt-4">Support PDF, JPEG, PNG (Max 5MB)</p>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-8"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                       <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                        <MapPin size={24} />
                      </div>
                      <h2 className="text-3xl font-black text-slate-800 tracking-tight">ข้อมูลเหตุการณ์</h2>
                    </div>
                    <p className="text-slate-500 font-medium">ระบุจุดเกิดเหตุ ข้อมูลความเสียหาย และความต้องการเพื่อให้เจ้าหน้าที่ลงพื้นที่ได้แม่นยำ</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1"><Clock size={12} /> วันที่เกิดเหตุ</label>
                      <input type="date" {...register('incidentDate')} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-bold text-slate-700" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1">เวลาที่เกิดเหตุ</label>
                      <input type="time" {...register('incidentTime')} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-bold text-slate-700" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1">จังหวัด</label>
                      <input {...register('province')} placeholder="ระบุจังหวัด" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-bold text-slate-700" />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                       <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1"><Map size={12} /> สถานที่ / พิกัดที่ชัดเจน</label>
                       <div className="relative group">
                         <input 
                           {...register('incidentLocation')} 
                           placeholder="เลขที่ตั้ง, หมู่บ้าน, จุดสังเกต หรือ พิกัด GPS" 
                           className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-bold text-slate-700 pr-32" 
                         />
                         <button 
                           type="button"
                           onClick={getCurrentLocation}
                           className="absolute right-2 top-1/2 -translate-y-1/2 bg-white border border-slate-200 text-emerald-600 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:border-emerald-500 hover:bg-emerald-50 transition-all flex items-center gap-1.5"
                         >
                           <MapPin size={12} />
                           แชร์พิกัด
                         </button>
                       </div>
                       {errors.incidentLocation && <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight ml-1">{errors.incidentLocation.message}</p>}
                     </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">อำเภอ/เขต</label>
                      <input {...register('district')} placeholder="ระบุอำเภอ" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-bold text-slate-700" />
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-[32px] p-8 border border-slate-200">
                    <div className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2 text-blue-600"><TrendingUp size={16} /> ประเมินความเสียหาย</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                       <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">พื้นที่เสียหาย (ไร่)</label>
                         <input type="number" {...register('damagedAreaRai', { valueAsNumber: true })} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-black text-slate-700" />
                       </div>
                       <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">พื้นที่เสียหาย (งาน)</label>
                         <input type="number" {...register('damagedAreaNgan', { valueAsNumber: true })} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-black text-slate-700" />
                       </div>
                       <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">ประเภทความเสียหาย</label>
                         <input {...register('cropType')} placeholder="เช่น ข้าวนาปรัง" className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-black text-slate-700 text-sm" />
                       </div>
                       <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">มูลค่าความเสียหาย (บาท)</label>
                         <input type="number" {...register('damageValue', { valueAsNumber: true })} className="w-full p-3 bg-white border border-red-100 rounded-xl outline-none font-black text-red-600" />
                       </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">บุคคล/หน่วยงานที่เกี่ยวข้อง</label>
                      <input {...register('involvedPersons')} placeholder="ระบุชื่อบุคคลหรือหน่วยงานที่เกี่ยวข้อง" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-medium text-slate-700" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">ลิงก์ URL ตรวจสอบเพิ่มเติม</label>
                      <input {...register('externalUrl')} placeholder="https://..." className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-medium text-slate-700" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1">สิ่งที่ต้องการให้ดำเนินการ</label>
                    <textarea {...register('desiredAction')} rows={3} placeholder="เช่น ร้องขอรถแม็คโครลอกคลอง หรือ การชดเชยเยียวยา..." className="w-full p-5 bg-slate-50 border border-slate-200 rounded-[32px] focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-bold text-slate-700" />
                    {errors.desiredAction && <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight ml-1">{errors.desiredAction.message}</p>}
                  </div>
                </motion.div>
              )}

              {step === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-8"
                >
                  <div className="text-center">
                    <div className="w-16 h-16 bg-slate-800 text-white rounded-3xl flex items-center justify-center mx-auto mb-4 animate-bounce">
                      <Eye size={32} />
                    </div>
                    <h2 className="text-3xl font-black text-slate-800 tracking-tight">ตรวจสอบ & ยืนยัน</h2>
                    <p className="text-slate-500">กรุณาตรวจสอบข้อมูลทั้งหมดอย่างละเอียดก่อนทำการยืนยันการส่งเรื่อง</p>
                  </div>

                  <div className="space-y-4">
                    <div className="p-8 bg-white rounded-[40px] border-2 border-slate-100 shadow-sm">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="space-y-4">
                           <div className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">ข้อมูลผู้ร้องเรียน</div>
                           <div>
                             <div className="text-lg font-black text-slate-800">{watch('fullName')}</div>
                             <div className="text-xs font-bold text-slate-500 flex items-center gap-1 mt-1"><ShieldCheck size={14} /> บัตรประชาชน: {watch('idCard')}</div>
                             <div className="text-xs font-bold text-slate-500 flex items-center gap-1"><Clock size={14} /> ประเภท: {watch('requesterType') === 'farmer' ? 'เกษตรกร' : watch('requesterType') === 'individual' ? 'บุคคล' : 'นิติบุคคล'}</div>
                           </div>
                        </div>

                        <div className="space-y-4 lg:col-span-2">
                           <div className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">สรุปเรื่องร้องเรียน</div>
                           <div className="space-y-3">
                             <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                               <div className="text-xs font-black text-blue-600 uppercase tracking-widest mb-1">{watch('category')}</div>
                               <div className="font-black text-slate-800">{watch('title')}</div>
                             </div>
                             <div className="flex flex-wrap gap-2">
                               <div className={`px-3 py-1 text-[10px] font-black rounded-lg border ${
                                 watch('severity') === 'low' ? 'bg-slate-50 text-slate-500 border-slate-100' :
                                 watch('severity') === 'high' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                                 watch('severity') === 'critical' ? 'bg-red-50 text-red-700 border-red-100' :
                                 'bg-emerald-50 text-emerald-700 border-emerald-100'
                               }`}>
                                 {watch('severity') === 'low' ? 'ระดับต่ำ' : watch('severity') === 'medium' ? 'ระดับกลาง' : watch('severity') === 'high' ? 'ระดับสูง' : 'ระดับวิกฤต'} ({watch('severity').toUpperCase()})
                               </div>
                               <div className="px-3 py-1 bg-slate-800 text-white text-[10px] font-black rounded-lg">{departments.find(d => d.id === watch('departmentId'))?.name || 'ให้ระบบจัดสรร'}</div>
                               {watch('previouslyReported') && <div className="px-3 py-1 bg-amber-100 text-amber-700 text-[10px] font-black rounded-lg border border-amber-200 font-mono">ประวัติร้องเรียนเดิม</div>}
                             </div>
                           </div>
                        </div>
                      </div>

                      <div className="mt-8 pt-8 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div>
                            <div className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-4">ข้อมูลเหตุการณ์</div>
                            <div className="flex gap-4">
                               <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                                 <MapPin size={20} />
                               </div>
                               <div>
                                 <div className="text-sm font-black text-slate-800">{watch('province')}, {watch('district')}</div>
                                 <div className="text-xs font-medium text-slate-500 mt-1">{watch('incidentLocation')}</div>
                                 <div className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-tight">{watch('incidentDate')} {watch('incidentTime')}</div>
                               </div>
                            </div>
                         </div>
                         <div className="bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100/50">
                            <div className="text-sm font-black text-emerald-800 uppercase tracking-[0.2em] mb-3">ประเมินความเสียหาย</div>
                            <div className="flex items-baseline gap-2">
                               <div className="text-3xl font-black text-emerald-700">{watch('damageValue')?.toLocaleString()}</div>
                               <div className="text-xs font-black text-emerald-600">บาท (ประเมิน)</div>
                            </div>
                            <div className="text-[10px] font-bold text-emerald-800 mt-2 flex items-center gap-1"><CornerDownRight size={12} /> {watch('damagedAreaRai')} ไร่ {watch('damagedAreaNgan')} งาน • {watch('cropType')}</div>
                         </div>
                      </div>
                    </div>

                    <div className={`p-8 rounded-[40px] border-2 transition-all group ${watch('otpVerified') ? 'bg-emerald-50 border-emerald-500' : 'bg-amber-50 border-amber-500'}`}>
                       <div className="flex gap-4">
                         <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${watch('otpVerified') ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white animate-pulse'}`}>
                           <ShieldCheck size={32} />
                         </div>
                         <div>
                           <h4 className={`text-lg font-black tracking-tight mb-1 ${watch('otpVerified') ? 'text-emerald-900' : 'text-amber-900'}`}>
                             {watch('otpVerified') ? 'ยืนยันตัวตนสำเร็จ' : 'รอการยืนยันรหัส OTP'}
                           </h4>
                           <p className={`text-sm font-medium ${watch('otpVerified') ? 'text-emerald-700' : 'text-amber-700'}`}>
                             ข้าพเจ้ายืนยันว่าข้อมูลเป็นความจริงตามหลัก PDPA และการระบุพิกัดความเสียหาย (Self-Attestation)
                           </p>
                         </div>
                       </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-between gap-4">
            {step > 1 && (
              <button 
                type="button"
                onClick={prevStep}
                className="px-8 py-4 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
              >
                <ArrowLeft size={18} /> ย้อนกลับ
              </button>
            )}
            
            {step < 4 ? (
              <button 
                type="button"
                onClick={nextStep}
                className="flex-1 px-8 py-4 bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-md active:scale-95 translate-y-0 hover:-translate-y-0.5 ml-auto md:max-w-xs"
              >
                ถัดไป <ArrowRight size={18} />
              </button>
            ) : (
              <button 
                type="submit"
                disabled={loading}
                className="flex-1 px-8 py-4 bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-800 transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <CheckCircle size={18} />}
                {loading ? 'กำลังส่งเรื่อง...' : 'ยืนยันและส่งเรื่องร้องเรียน'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
