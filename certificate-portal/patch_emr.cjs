const fs = require('fs');
const p = 'c:\\main project\\project\\certificate-portal\\src\\dashboard\\EMRDashboardLayout.jsx';
let content = fs.readFileSync(p, 'utf8');

const target = "  { text: 'My Certificates',   icon: <VerifiedUserOutlinedIcon />,   path: '/dashboard/my-certificates' },";
const replacement = "  { text: 'My Certificates',   icon: <VerifiedUserOutlinedIcon />,   path: '/dashboard/my-certificates' },\n  { text: 'Med Cert Requests', icon: <MedicalServicesOutlinedIcon />,path: '/dashboard/certificate-requests', roles: ['general_user'] },";

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(p, content);
  console.log('Patched EMRDashboardLayout.jsx');
} else {
  console.log('Target not found in EMRDashboardLayout.jsx');
}
