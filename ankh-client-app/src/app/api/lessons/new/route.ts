import { NextRequest, NextResponse } from "next/server"
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {

    const requestBody = await request.json();
    console.log('Incoming request payload:', requestBody);

    const {
        lessonType,
        lessonDate,
        lessonContent,
        instructorId,
        instructorIds,
        location,
        customers,
        groupParticipantCount,
        groupCompany
    } = requestBody;

    if (!lessonType || !instructorId || !location) {
        return NextResponse.json(
            { error: 'Missing required lesson fields: lessonType, instructorId, locationId.' },
            { status: 400 }
        );
    }

    if (lessonType === 'Group') {
        if (!groupParticipantCount || groupParticipantCount < 1) {
            return NextResponse.json(
                { error: 'Group lessons require a participant count of at least 1.' },
                { status: 400 }
            );
        }
    } else {
        if (!customers || !Array.isArray(customers) || customers.length === 0) {
            return NextResponse.json(
                { error: 'Individual lessons require at least one customer.' },
                { status: 400 }
            );
        }
    }

    try {
        const parsedLessonDate = lessonDate ? new Date(lessonDate) : null
        const lessonCreatedAt = parsedLessonDate && !Number.isNaN(parsedLessonDate.getTime())
            ? parsedLessonDate
            : undefined

        const newLesson = await prisma.lesson.create({
            data: {
                lessonType: lessonType,
                lessonContent: lessonContent || null,
                groupParticipantCount: lessonType === 'Group' ? (groupParticipantCount ?? null) : null,
                groupCompany: lessonType === 'Group' ? (groupCompany || null) : null,
                ...(lessonCreatedAt ? { createdAt: lessonCreatedAt } : {}),
                instructor: {
                    connect: { id: instructorId }
                },
                location: {
                    connect: { id: location }
                }
            },
            select: {
                id: true,
                lessonType: true,
                groupParticipantCount: true,
                groupCompany: true,
                createdAt: true,
                instructorId: true,
                locationId: true
            },
        });

        // Create additional instructor assignments if instructorIds array provided
        if (Array.isArray(instructorIds) && instructorIds.length > 0) {
            const additionalIds = instructorIds.filter(
                (id: string) => id && id !== instructorId
            )
            if (additionalIds.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (prisma as any).lessonInstructor.createMany({
                    data: additionalIds.map((userId: string) => ({
                        lessonId: newLesson.id,
                        userId
                    })),
                    skipDuplicates: true
                })
            }
        }

        // For individual lessons only: process customers array
        if (lessonType === 'Individual' && Array.isArray(customers)) {
            for (const customerData of customers) {
                let customer
                if (customerData.email && customerData.email.trim()) {
                    customer = await prisma.customer.upsert({
                        where: { email: customerData.email },
                        update: {},
                        create: {
                            email: customerData.email,
                            firstName: customerData.firstName,
                            lastName: customerData.lastName,
                            phone: customerData.phone || null,
                            company: customerData.company || null
                        }
                    })
                } else if (customerData.id) {
                    const found = await prisma.customer.findUnique({ where: { id: customerData.id } })
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    customer = found ?? await (prisma.customer.create as any)({
                        data: {
                            firstName: customerData.firstName,
                            lastName: customerData.lastName,
                            phone: customerData.phone || null,
                            company: customerData.company || null
                        }
                    })
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    customer = await (prisma.customer.create as any)({
                        data: {
                            firstName: customerData.firstName,
                            lastName: customerData.lastName,
                            phone: customerData.phone || null,
                            company: customerData.company || null
                        }
                    })
                }

                await prisma.lessonParticipant.create({
                    data: {
                        lessonId: newLesson.id,
                        customerId: customer.id,
                        status: customerData?.feedback || "attended",
                        customerSymptoms: customerData?.symptoms,
                        customerImprovements: customerData?.improvements
                    }
                });
            }
        }

        return NextResponse.json({ lesson: newLesson }, { status: 201 });
    }
    catch (error) {
        console.error('Error creating lesson:', error);

        if (error instanceof Error && error.message.includes('Foreign key constraint failed')) {
            return NextResponse.json(
                { error: 'Invalid instructorId or locationId provided.' },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Internal server error while creating lesson' },
            { status: 500 }
        );
    }
}
