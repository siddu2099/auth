exports.checkCooldown = (last, ms = 60000) =>
  last && Date.now() - last.getTime() < ms;
