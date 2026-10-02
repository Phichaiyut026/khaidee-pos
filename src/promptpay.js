import QRCode from 'qrcode';

// Thai PromptPay QR payload (EMVCo merchant-presented QR).
function field(id, value) {
  return id + String(value.length).padStart(2, '0') + value;
}

function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function promptPayPayload(target, amount) {
  const id = String(target).replace(/\D/g, '');
  let account;
  if (id.length >= 15) account = field('03', id); // e-wallet
  else if (id.length >= 13) account = field('02', id); // national ID / tax ID
  else account = field('01', ('0000000000000' + id.replace(/^0/, '66')).slice(-13)); // phone

  let payload =
    field('00', '01') +
    field('01', amount ? '12' : '11') +
    field('29', field('00', 'A000000677010111') + account) +
    field('53', '764') +
    (amount ? field('54', Number(amount).toFixed(2)) : '') +
    field('58', 'TH') +
    '6304';
  return payload + crc16(payload);
}

export async function promptPayQR(target, amount) {
  if (!target) return null;
  return QRCode.toDataURL(promptPayPayload(target, amount), { margin: 1, width: 320 });
}
