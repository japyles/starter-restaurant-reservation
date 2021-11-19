const asyncErrorBoundary = require('../errors/asyncErrorBoundary')
const service = require('./tables.service')
const reservationService = require('../reservations/reservations.service')

const tableExists = async (req, res, next) => {
    const { tableId } = req.params
    const table = await service.read(tableId)

    if (table) {
        res.locals.table = table
        next()
    } else {
        next({ status: 404, message: `Table ID ${tableId} cannot be found`})
    }
}

const validateTables = async (req, res, next) => {
    const { data: { table_name, capacity }} = req.body

    if (!table_name || table_name === '') {
        return next({ status: 400, message: 'table_name is missing'})
    }

    if (!capacity || capacity < 1) {
        return next({ status: 400, message: 'Capacity must be at least 1 or more'})
    }

    if (table_name.length < 2) {
        return next({ status: 400, message: 'table_name must be longer than a single character'})
    }

    next()
}

const checkForReservation = (req, res, next) => {
    if (!res.locals.table.reservation_id) {
        return next({ status: 400, message: 'No reservation found'})
    }
    next()
}

const create = async (req, res) => {
    const data = await service.create(req.body.data)
    res.status(201).json({ data })
}

const list = async (req, res) => {
    const data = await service.list()
    res.json({ data })
}

const destroy = async (req, res) => {
    const {data: { table_id } = {} } = req.body
    const data = await service.destroy(table_id)
    res.status(200).json({ data })
    // await service.destroy(res.locals.table.table_id)
    // res.status(204)
}

const removeReservation = async (req, res, next) => {
    if (!res.locals.table.reservation_id) {
        return next({ status: 400, message: 'No reservation found'})
    }

    const table = await {...res.locals.table, reservation_id: null}

    await reservationService.update (
        Number(res.locals.table.reservation_id), 
        'finished'
    )

    const data = await service.update(table)
    res.status(200).json({ data })
}

const isTableAlreadyOccupied = (req, res, next) => {
    if (res.locals.reservation_id) {
        return next({ status: 400, message: `Table already reserved by ${res.locals.table.reservation_id}`})
    }
    next()
}

const resExists = async (req, res, next) => {
    const reservationId = req.body.data.reservation_id

    if (!reservationId) {
        next({ status: 400, message: 'reservation_id missing'})
    }

    const reservation = await reservationService.read(reservationId)

    if (reservation) {
        if (reservation.status === 'seated') {
            next({ status: 400, message: 'reservation is already seated'})
        }
        res.locals.seatingreservation = reservation
        next()
    } else {
        next({ status: 404, message: `reservation_id ${reservationId} does not exist`})
    }
}

const capacityCheck = async (req, res, next) => {
    if (res.locals.table.capacity < res.locals.seatingreservation.people) {
        next({ status: 400, message: 'Table capacity insufficient for number of people on reservation'})
    } else {
        next()
    }
}

const validateDataSent = async (req, res, next) => {
    const { data } = req.body

    if (!data || !data.reservation_id) {
        return next({ status: 400, message: 'Data and reservation_id do not exist'})
    }
    next()
}

const update = async (req, res) => {
    const updatedTable = await {
        ...res.locals.table,
        reservation_id: req.body.data.reservation_id
    }

    await reservationService.update(Number(req.body.data.reservation_id), 'seated')
    const updatedData = await service.update(updatedTable)
    res.status(200).json({ data: updatedData })
}

module.exports = {
    list: [asyncErrorBoundary(list)],
    create: [validateTables, asyncErrorBoundary(create)],
    update: [asyncErrorBoundary(tableExists), validateDataSent, asyncErrorBoundary(resExists), capacityCheck, isTableAlreadyOccupied, asyncErrorBoundary(update)],
    destroy,
    removeReservation: [asyncErrorBoundary(tableExists), checkForReservation, asyncErrorBoundary(removeReservation)],
}