const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Object keys are always built here from the user id and a server generated
// uuid, never taken from the request.
export function objectKeys(userId: string, objectId: string) {
  if (!UUID.test(userId) || !UUID.test(objectId))
    throw new Error("Invalid object id");
  return {
    audioKey: `${userId}/${objectId}.mp3`,
    peaksKey: `${userId}/${objectId}.json`,
  };
}
