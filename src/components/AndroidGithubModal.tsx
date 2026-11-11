import React, { useState, useEffect } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  getSelectedRingtone,
  setSelectedRingtone,
  playAlarmPulse,
  triggerStrongAndroidNotification,
  type RingtonePattern,
} from '../utils/soundEngine';

interface AndroidGithubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'warning' | 'info') => void;
}

interface DeployResult {
  owner: string;
  repo: string;
  repoUrl: string;
  releasesUrl: string;
  latestReleaseDownloadUrl: string;
  actionsUrl: string;
}

export const AndroidGithubModal: React.FC<AndroidGithubModalProps> = ({
  isOpen,
  onClose,
  onShowToast,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<'install' | 'github' | 'sound'>('github');

  // GitHub deployment state
  const [githubToken, setGithubToken] = useState<string>(() => {
    try {
      return localStorage.getItem('tiryaq_gh_token') || '';
    } catch {
      return '';
    }
  });
  const [repoName, setRepoName] = useState<string>('tiryaq-alwalid-android');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(() => {
    try {
      const saved = localStorage.getItem('tiryaq_last_deploy');
      return saved ? (JSON.parse(saved) as DeployResult) : null;
    } catch {
      return null;
    }
  });
  const [releaseCheck, setReleaseCheck] = useState<{
    statusText: string;
    apkUrl: string | null;
    releasePageUrl: string | null;
    isReady: boolean;
  } | null>(null);
  const [hasOAuthConfig, setHasOAuthConfig] = useState(false);
  const [hasServerToken, setHasServerToken] = useState(false);

  // Sound & Notification test state
  const [ringtone, setRingtone] = useState<RingtonePattern>(getSelectedRingtone());

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/github/status')
      .then((r) => r.json())
      .then((data: { hasOAuthConfig?: boolean; hasServerToken?: boolean }) => {
        setHasOAuthConfig(Boolean(data.hasOAuthConfig));
        setHasServerToken(Boolean(data.hasServerToken));
      })
      .catch(() => {});
  }, [isOpen]);

  // Listen for OAuth popup success message
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setHasServerToken(true);
        onShowToast('تم ربط حساب GitHub بنجاح!', 'success');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onShowToast]);

  // Poll GitHub Release status when deployResult is available
  useEffect(() => {
    if (!isOpen || !deployResult) return;

    const checkStatus = async () => {
      try {
        const res = await fetch(
          `/api/github/release-status?owner=${encodeURIComponent(
            deployResult.owner
          )}&repo=${encodeURIComponent(deployResult.repo)}`,
          {
            headers: githubToken ? { Authorization: `Bearer ${githubToken}` } : {},
          }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          latestRelease?: {
            tagName?: string;
            htmlUrl?: string;
            apkDownloadUrl?: string;
          } | null;
          workflowStatus?: {
            status?: string;
            conclusion?: string | null;
          } | null;
        };

        if (data.latestRelease?.apkDownloadUrl) {
          setReleaseCheck({
            statusText: `تم إصدار النسخة (${data.latestRelease.tagName || 'v1.0'}) بنجاح! ملف APK جاهز للتحميل المباشر.`,
            apkUrl: data.latestRelease.apkDownloadUrl,
            releasePageUrl: data.latestRelease.htmlUrl || deployResult.releasesUrl,
            isReady: true,
          });
        } else if (data.workflowStatus) {
          const st = data.workflowStatus.status;
          if (st === 'in_progress' || st === 'queued') {
            setReleaseCheck({
              statusText:
                'جاري بناء ملف الـ APK الآن عبر GitHub Actions (يستغرق حوالي دقيقة إلى دقيقتين)...',
              apkUrl: deployResult.latestReleaseDownloadUrl,
              releasePageUrl: deployResult.releasesUrl,
              isReady: false,
            });
          } else if (data.workflowStatus.conclusion === 'success') {
            setReleaseCheck({
              statusText: 'اكتمل بناء تطبيق الأندرويد بنجاح على GitHub Releases!',
              apkUrl: deployResult.latestReleaseDownloadUrl,
              releasePageUrl: deployResult.releasesUrl,
              isReady: true,
            });
          }
        }
      } catch {
        // ignore network poll errors
      }
    };

    checkStatus();
    const timer = setInterval(checkStatus, 10000);
    return () => clearInterval(timer);
  }, [isOpen, deployResult, githubToken]);

  if (!isOpen) return null;

  const handleOAuthConnect = async () => {
    try {
      const response = await fetch('/api/auth/github/url');
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        onShowToast(data.error || 'تعذر فتح رابط OAuth', 'warning');
        return;
      }
      window.open(data.url, 'github_oauth_popup', 'width=600,height=700');
    } catch {
      onShowToast('تعذر الاتصال بخادم المصادقة', 'warning');
    }
  };

  const handleDeployToGithub = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeployError(null);
    setIsDeploying(true);

    try {
      if (githubToken.trim()) {
        localStorage.setItem('tiryaq_gh_token', githubToken.trim());
      }

      const res = await fetch('/api/github/deploy-android', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: githubToken.trim(),
          repoName: repoName.trim() || 'tiryaq-alwalid-android',
          isPrivate: false,
        }),
      });

      const data = (await res.json()) as DeployResult & { error?: string };
      if (!res.ok) {
        setDeployError(data.error || 'حدث خطأ أثناء الرفع إلى GitHub');
        setIsDeploying(false);
        return;
      }

      setDeployResult(data);
      localStorage.setItem('tiryaq_last_deploy', JSON.stringify(data));
      setReleaseCheck({
        statusText:
          'تم رفع الكود وبدء بناء ملف الـ APK تلقائياً عبر GitHub Actions! سيظهر رابط التحميل النهائي فور انتهاء البناء.',
        apkUrl: data.latestReleaseDownloadUrl,
        releasePageUrl: data.releasesUrl,
        isReady: false,
      });
      onShowToast('تم رفع المشروع إلى GitHub وبدء بناء ملف الـ APK بنجاح!', 'success');
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : 'فشل الاتصال بالخادم');
    } finally {
      setIsDeploying(false);
    }
  };

  const handleSelectRingtone = (pattern: RingtonePattern) => {
    setRingtone(pattern);
    setSelectedRingtone(pattern);
    playAlarmPulse(pattern);
    onShowToast('تم تغيير نغمة الرنين وتجربتها بنجاح', 'success');
  };

  const handleTestStrongNotification = async () => {
    playAlarmPulse(ringtone);
    const sent = await triggerStrongAndroidNotification(
      'ترياق الوالد | اختبار إشعار الأندرويد القوي',
      'الإشعارات الصوتية والاهتزاز تعمل بكفاءة عالية لتنبيهك بموعد تجديد أدوية الوالد.'
    );
    if (sent) {
      onShowToast('تم إرسال إشعار أندرويد قوي مع اهتزاز ورنين!', 'success');
    } else {
      onShowToast('تم تشغيل الرنين والاهتزاز (فعّل صلاحية الإشعارات من الأعلى لظهور البطاقة)', 'info');
    }
  };

  return (
    <div
      id="androidGithubModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="androidModalTitle"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden my-8">
        {/* ترويسة النافذة */}
        <div className="bg-gradient-to-r from-slate-900 via-emerald-900 to-emerald-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center text-xl">
              <i className="fa-brands fa-android text-emerald-300"></i>
            </div>
            <div>
              <h2 id="androidModalTitle" className="text-base sm:text-lg font-black">
                تطبيق الأندرويد (APK) والرفع إلى GitHub Releases
              </h2>
              <p className="text-[11px] text-emerald-100 font-semibold">
                تثبيت فوري على الهاتف • بناء APK رسمي • تخصيص الرنين القوي والاهتزاز
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة الأندرويد وجيت هاب"
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* تبويبات النافذة */}
        <div className="grid grid-cols-3 gap-1 p-2 bg-slate-100 border-b border-slate-200 text-xs font-extrabold">
          <button
            type="button"
            onClick={() => setActiveTab('github')}
            className={`py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5 ${
              activeTab === 'github'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <i className="fa-brands fa-github text-sm"></i>
            <span>الرفع لـ GitHub ورابط Release</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('install')}
            className={`py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5 ${
              activeTab === 'install'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <i className="fa-solid fa-mobile-screen-button text-sm"></i>
            <span>التثبيت المباشر على الهاتف</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sound')}
            className={`py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5 ${
              activeTab === 'sound'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <i className="fa-solid fa-bell-concierge text-sm"></i>
            <span>قوة الرنات والإشعارات</span>
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* التبويب الأول: الرفع لجيت هاب واستخراج رابط الـ Release APK */}
          {activeTab === 'github' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-950 space-y-1.5">
                <div className="font-black text-sm flex items-center gap-2 text-emerald-800">
                  <i className="fa-solid fa-rocket"></i>
                  <span>بناء ملف APK رسمي ورفعه تلقائياً إلى صفحة GitHub Releases</span>
                </div>
                <p className="leading-relaxed font-semibold text-slate-700">
                  يرفع هذا المعالج المشروع بالكامل مع إعدادات <strong>Capacitor Android</strong> وملف{' '}
                  <strong>GitHub Actions Workflow</strong> إلى حسابك في GitHub، ليقوم ببناء ملف{' '}
                  <code className="bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-800">
                    tiryaq-alwalid-android.apk
                  </code>{' '}
                  وإصدار رابط التحميل المباشر من صفحة <strong>Releases</strong>.
                </p>
              </div>

              {/* نتيجة الرفع وروابط التحميل من صفحة Releases */}
              {deployResult && (
                <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-3 border border-emerald-500/40 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                      روابط التحميل المباشرة من GitHub Releases
                    </span>
                    <a
                      href={deployResult.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-bold text-slate-300 hover:text-white underline"
                    >
                      {deployResult.owner}/{deployResult.repo}
                    </a>
                  </div>

                  {releaseCheck && (
                    <div
                      className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                        releaseCheck.isReady
                          ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                      }`}
                    >
                      <i
                        className={`fa-solid ${
                          releaseCheck.isReady ? 'fa-circle-check' : 'fa-spinner fa-spin'
                        }`}
                      ></i>
                      <span>{releaseCheck.statusText}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <a
                      href={releaseCheck?.apkUrl || deployResult.latestReleaseDownloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition shadow"
                    >
                      <i className="fa-solid fa-download"></i>
                      <span>رابط تحميل APK المباشر (Release)</span>
                    </a>

                    <a
                      href={releaseCheck?.releasePageUrl || deployResult.releasesUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-2 transition"
                    >
                      <i className="fa-solid fa-tags"></i>
                      <span>فتح صفحة Releases على GitHub</span>
                    </a>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-white/10">
                    <span>الرابط المباشر لملف APK:</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          releaseCheck?.apkUrl || deployResult.latestReleaseDownloadUrl
                        );
                        onShowToast('تم نسخ رابط تحميل الـ APK من صفحة Releases!', 'success');
                      }}
                      className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1"
                    >
                      <i className="fa-regular fa-copy"></i>
                      <span>نسخ الرابط</span>
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleDeployToGithub} className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="ghRepoName" className="block text-xs font-bold text-slate-700">
                      اسم المستودع على GitHub
                    </label>
                    <input
                      id="ghRepoName"
                      type="text"
                      required
                      value={repoName}
                      onChange={(e) => setRepoName(e.target.value)}
                      placeholder="tiryaq-alwalid-android"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="ghTokenInput" className="block text-xs font-bold text-slate-700">
                      رمز الوصول لـ GitHub (Token بصلاحية repo + workflow)
                    </label>
                    <input
                      id="ghTokenInput"
                      type="password"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      placeholder={
                        hasServerToken
                          ? 'تم ربط الحساب (أو أدخل Token جديد)'
                          : 'ghp_xxxxxxxxxxxxxxxxxxxx'
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>
                    لإنشاء Token سريع:{' '}
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=Tiryaq+AlWalid+Android+APK"
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-700 font-extrabold underline"
                    >
                      اضغط هنا لفتح إعدادات GitHub مع تفعيل صلاحية repo و workflow
                    </a>
                  </span>

                  {hasOAuthConfig && (
                    <button
                      type="button"
                      onClick={handleOAuthConnect}
                      className="px-3 py-1 rounded-lg bg-slate-800 text-white font-bold hover:bg-slate-700"
                    >
                      ربط عبر نافذة GitHub OAuth
                    </button>
                  )}
                </div>

                {deployError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
                    <i className="fa-solid fa-circle-exclamation ml-1"></i>
                    {deployError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={isDeploying}
                    className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-2"
                  >
                    <i
                      className={`fa-brands fa-github text-sm ${
                        isDeploying ? 'animate-spin' : ''
                      }`}
                    ></i>
                    <span>
                      {isDeploying
                        ? 'جاري رفع المشروع وتفعيل بناء الـ APK على GitHub...'
                        : 'رفع المشروع لـ GitHub وإصدار رابط التحميل من صفحة Releases'}
                    </span>
                  </button>

                  <a
                    href="/api/android/download-bundle"
                    download="tiryaq-alwalid-android-project.zip"
                    className="w-full sm:w-auto py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition flex items-center justify-center gap-1.5"
                  >
                    <i className="fa-solid fa-file-zipper text-amber-600"></i>
                    <span>تحميل حزمة المشروع (ZIP)</span>
                  </a>
                </div>
              </form>
            </div>
          )}

          {/* التبويب الثاني: التثبيت المباشر على الهاتف */}
          {activeTab === 'install' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-2xl shrink-0">
                    <i className="fa-brands fa-android"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      الطريقة الأولى: التثبيت الفوري كتطبيق مستقل (PWA Standalone)
                    </h3>
                    <p className="text-xs text-slate-600 font-semibold mt-1 leading-relaxed">
                      يعمل التطبيق بكامل الشاشة على أندرويد بدون شريط متصفح، ويحفظ كافة الأدوية
                      والرنات على الهاتف حتى بدون اتصال بالإنترنت.
                    </p>
                  </div>
                </div>

                {isInstalled ? (
                  <div className="p-3 rounded-xl bg-emerald-100 text-emerald-900 text-xs font-black flex items-center gap-2">
                    <i className="fa-solid fa-circle-check text-emerald-600 text-base"></i>
                    <span>التطبيق مثبت بالفعل على جهازك ويعمل في وضع الهاتف المستقل!</span>
                  </div>
                ) : isInstallable ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await install();
                      if (ok) {
                        onShowToast('تم تثبيت تطبيق ترياق الوالد على الهاتف بنجاح!', 'success');
                      }
                    }}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-download"></i>
                    <span>تثبيت التطبيق على الهاتف الآن (ضغطة واحدة)</span>
                  </button>
                ) : (
                  <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 space-y-1.5 font-semibold">
                    <p className="font-black text-slate-900">
                      {isIOS
                        ? 'للتثبيت على آيفون / آيباد:'
                        : 'للتثبيت المباشر من متصفح Chrome على هاتف الأندرويد:'}
                    </p>
                    {isIOS ? (
                      <ol className="list-decimal list-inside space-y-1">
                        <li>اضغط على زر المشاركة (Share) في شريط المتصفح.</li>
                        <li>اختر &quot;الإضافة إلى الشاشة الرئيسية&quot; (Add to Home Screen).</li>
                      </ol>
                    ) : (
                      <ol className="list-decimal list-inside space-y-1">
                        <li>افتح قائمة متصفح كروم (النقاط الثلاث أعلى الشاشة).</li>
                        <li>
                          اختر <strong>&quot;تثبيت التطبيق&quot; (Install App)</strong> أو{' '}
                          <strong>&quot;الإضافة إلى الشاشة الرئيسية&quot;</strong>.
                        </li>
                      </ol>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <i className="fa-solid fa-box-archive text-emerald-600"></i>
                  <span>الطريقة الثانية: تثبيت حزمة APK عبر GitHub Releases</span>
                </h3>
                <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                  من تبويب <strong>&quot;الرفع لـ GitHub ورابط Release&quot;</strong> بالأعلى، يمكنك
                  رفع المشروع بنقرة واحدة ليقوم GitHub Actions بتوليد ملف{' '}
                  <code>tiryaq-alwalid-android.apk</code> جاهز للتحميل والتثبيت المباشر.
                </p>
              </div>
            </div>
          )}

          {/* التبويب الثالث: قوة الرنات والإشعارات */}
          {activeTab === 'sound' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-950 space-y-1">
                <div className="font-black text-sm flex items-center gap-2 text-amber-900">
                  <i className="fa-solid fa-volume-high"></i>
                  <span>ضمان أعلى صوت رنين واهتزاز لتنبيهات أدوية الوالد</span>
                </div>
                <p className="font-semibold text-slate-700 leading-relaxed">
                  تم تزويد التطبيق بمحرك صوتي متعدد الترددات مع اهتزاز الهاتف (Android Vibration API)
                  ومنع قفل الشاشة أثناء الرنين (WakeLock) وإشعارات النظام المستمرة.
                </p>
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-black text-slate-800">
                  اختر نغمة الرنين المفضلة للتنبيه العاجل:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    {
                      id: 'emergency' as RingtonePattern,
                      title: 'نغمة الطوارئ الأصلية',
                      desc: 'رنين مزدوج واضح ومتوازن (الافتراضي)',
                    },
                    {
                      id: 'intensive' as RingtonePattern,
                      title: 'صافرة الإنذار القوية',
                      desc: 'تردد عالي الكثافة مخصص لكبار السن',
                    },
                    {
                      id: 'classic' as RingtonePattern,
                      title: 'جرس الهاتف الكلاسيكي',
                      desc: 'رنين جرس متقطع عالي النقاء',
                    },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectRingtone(item.id)}
                      className={`p-3 rounded-2xl border text-right transition flex flex-col justify-between ${
                        ringtone === item.id
                          ? 'bg-emerald-50 border-emerald-600 ring-2 ring-emerald-200'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-black text-slate-900">{item.title}</span>
                        {ringtone === item.id && (
                          <i className="fa-solid fa-circle-check text-emerald-600"></i>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 font-semibold">{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestStrongNotification}
                  className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-bell-concierge"></i>
                  <span>اختبار الإشعار القوي + الرنين + اهتزاز الهاتف الآن</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
