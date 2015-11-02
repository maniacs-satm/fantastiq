local key_config,
      key_nextId,
      key_inactive,
      key_delayed,
      key_jobDetails,
      key_index = unpack(KEYS)

local timestamp,
      priority,
      runAt = unpack(ARGV)
local jobDatas = {select(4, unpack(ARGV))}

timestamp = tonumber(timestamp)
runAt = tonumber(runAt)
priority = tonumber(priority)

local unique = redis.call('HGET', key_config, 'unique')
if unique then unique = cjson.decode(unique) end

local jobIds = {}
for i, jobData in ipairs(jobDatas) do

  local uniqueId
  local existing

  if unique then
    if type(unique) == 'string' then
      local parsed = cjson.decode(jobData)
      if type(parsed) == 'table' then
        local keyType = type(parsed[unique])
        if keyType == 'string' or keyType == 'number' or keyType == 'boolean' then
          uniqueId = tostring(parsed[unique])
        end
      end
    end

    if not uniqueId then
      uniqueId = jobData
    end
    existing = redis.call('HGET', key_index, uniqueId)
  end

  if existing then
    jobIds[i] = existing
  else
    local nextId = redis.call('INCR', key_nextId)
    local jobId = string.format('%013X', nextId)

    if uniqueId then
      redis.call('HSET', key_index, uniqueId, jobId)
    end

    jobIds[i] = jobId

    local jobDetails = {
      id = jobId,
      priority = priority,
      data = jobData,
      created = timestamp,
      attempts = 0,
      key = uniqueId
    }

    if runAt > timestamp then
      redis.call('ZADD', key_delayed, runAt, jobId)
      jobDetails['state'] = 'delayed'
      jobDetails['runAt'] = runAt
    else
      redis.call('ZADD', key_inactive, priority, jobId)
      jobDetails['state'] = 'inactive'
    end

    fantastiq.setJobDetails(key_jobDetails, jobId, jobDetails)
  end
end

return jobIds
