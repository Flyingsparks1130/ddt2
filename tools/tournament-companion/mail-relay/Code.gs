// Run once in the organizer's Google account. Keys are visible in Project Settings.
function setupMatchEmail() {
  const props = PropertiesService.getScriptProperties();
  for (const name of ['OPERATOR_1', 'OPERATOR_2']) {
    if (!props.getProperty(name)) {
      props.setProperty(name, (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''));
    }
  }
  MailApp.getRemainingDailyQuota();
}

function doPost(event) {
  function reply(fields) {
    return ContentService.createTextOutput(JSON.stringify(Object.assign({service:'ddt2-mail/v1'}, fields)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const props = PropertiesService.getScriptProperties();
  try {
    if (!event.postData || event.postData.length > 13400000) return reply({ok:false,error:'Email request is too large.'});
    const input = JSON.parse(event.postData.contents);
    if (typeof input.key !== 'string' || !/^[a-f0-9]{64}$/.test(input.key) ||
        !['OPERATOR_1','OPERATOR_2'].some(name => props.getProperty(name) === input.key)) {
      return reply({ok:false,error:'The operator key was not accepted.'});
    }
    const owner = Session.getEffectiveUser().getEmail();
    if (!owner) return reply({ok:false,error:'Deploy the sender using the organizer’s Google account.'});
    if (input.action === 'check') return reply({ok:true});
    if (input.action !== 'send' || !/^DDT2-r[1-4]-m[1-9][0-9]*\.zip$/i.test(input.filename) ||
        typeof input.zip !== 'string' || input.zip.length > 13333336) {
      return reply({ok:false,error:'Choose a DDT2 match ZIP.'});
    }
    const bytes = Utilities.base64Decode(input.zip);
    const entry = 'approved-results.json';
    if (bytes.length < 100 || bytes.length > 10000000 || bytes[0] !== 80 || bytes[1] !== 75 ||
        bytes[2] !== 3 || bytes[3] !== 4 || bytes[26] !== entry.length || bytes[27] !== 0 ||
        String.fromCharCode.apply(null, bytes.slice(30,30+entry.length)) !== entry) {
      return reply({ok:false,error:'The attachment is not a Helper match export.'});
    }
    const digest = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
    const receipt = 'MAIL_' + digest;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return reply({ok:false,error:'Another match is being sent. Try again shortly.'});
    try {
      const previous = props.getProperty(receipt);
      if (previous === 'sent') return reply({ok:true,alreadySent:true});
      if (previous) return reply({ok:false,error:'Delivery is unconfirmed. Ask the organizer to check Gmail Sent before retrying.'});
      if (!MailApp.getRemainingDailyQuota()) return reply({ok:false,error:'The organizer’s daily Google email quota has been reached.'});
      const label = input.filename.slice(5,-4).toUpperCase();
      const zip = Utilities.newBlob(bytes, 'application/zip', input.filename);
      props.setProperty(receipt, 'pending ' + input.filename);
      MailApp.sendEmail({to:owner, subject:'DDT2 match results · ' + label,
        body:'The approved match export for ' + label + ' is attached.', attachments:[zip]});
      props.setProperty(receipt, 'sent');
      return reply({ok:true,alreadySent:false});
    } finally { lock.releaseLock(); }
  } catch (error) {
    return reply({ok:false,error:'Google did not confirm delivery. Check Sent before retrying.'});
  }
}
