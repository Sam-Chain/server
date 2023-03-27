const axios = require('axios')

const launchesDatabase = require('./launches.mongo')
const planets = require('./planets.mongo')

const DEFAULT_FLIGHT_NUMBER = 100

const SPACE_X_API_URL = 'https://api.spacexdata.com/v4/launches/query'

async function populateLaunches() {
    console.log('downloading lunches data from space x api')
    const response = await axios.post(SPACE_X_API_URL, {
        query: {},
        options: {
            pagination: false,
            populate: [
                {
                    path: 'rocket',
                    select: { 'name': 1 }
                },
                {
                    path: 'payloads',
                    select: { 'customers': 1 }
                }

            ]
        }
    })
    if (response.status !== 200) {
        console.log('problem downloading launches')
        throw new Error('launch data download failed')
    }
    const launchDocs = response.data.docs
    for (const launchDoc of launchDocs) {
        const payloads = launchDoc['payloads']
        const customers = payloads.flatMap((payload) => {
            return payload['customers']
        })
        const launch = {
            flightNumber: launchDoc['flight_number'],
            mission: launchDoc['name'],
            rocket: launchDoc['rocket']['name'],
            launchDate: launchDoc['date_local'],
            customers: customers,
            upcoming: launchDoc['upcoming'],
            success: launchDoc['success']
        }
        // console.log(`${launch.flightNumber} ${launch.mission}`)

        await saveLaunch(launch)
    }
}

async function loadLaunchesData() {
    const firstLaunch = await findLaunch({
        flightNumber: 1,
        rocket: 'Falcon 1',
        mission: 'FalconSat'
    })
    if (firstLaunch) {
        console.log('launch data already loaded!')
    } else {
        await populateLaunches()
    }

}

async function findLaunch(filter) {
    return await launchesDatabase.findOne(filter)
}

async function existLaunchWithId(launchId) {
    return await findLaunch({ flightNumber: launchId })
}

async function getLatestFlightNumber() {
    const latestLaunch = await launchesDatabase.findOne().sort('-flightNumber')

    if (!latestLaunch) {
        return DEFAULT_FLIGHT_NUMBER
    }

    return latestLaunch.flightNumber
}

async function getAllLaunches(skip, limit) {
    return await launchesDatabase
        .find({}, { '_id': 0, '__v': 0 })
        .sort({ flightNumber: 1 })
        .skip(skip)
        .limit(limit)
}

async function saveLaunch(launch) {

    await launchesDatabase.updateOne({
        flightNumber: launch.flightNumber
    }, launch, {
        upsert: true
    })
}

async function scheduleNewLaunch(launch) {
    const planet = await planets.findOne({ keplerName: launch.target })

    if (!planet) {
        throw new Error('No matching planet found')
    }

    const newFlightNumber = await getLatestFlightNumber() + 1


    const newLaunch = Object.assign(launch, {
        success: true,
        upcoming: true,
        customers: ['Zero to Mastery', 'NASA'],
        flightNumber: newFlightNumber
    })

    saveLaunch(newLaunch)

}

async function abortLaunchById(launchId) {
    const aborted = await launchesDatabase.updateOne({ flightNumber: launchId }, {
        upcoming: false,
        success: false
    })

    return aborted.acknowledged === true && aborted.modifiedCount === 1
    // return aborted
}

module.exports = {
    loadLaunchesData,
    getAllLaunches,
    scheduleNewLaunch,
    existLaunchWithId,
    abortLaunchById
}