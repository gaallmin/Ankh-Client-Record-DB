import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Get command line arguments
  const args = process.argv.slice(2)
  
  if (args.length !== 2) {
    console.error('❌ Usage: npm run seed -- <username> <password>')
    console.error('Example: npm run seed -- admin mypassword123')
    process.exit(1)
  }

  const [username, password] = args

  // Validate input
  if (!username || username.trim().length === 0) {
    console.error('❌ Username cannot be empty')
    process.exit(1)
  }

  if (!password || password.trim().length === 0) {
    console.error('❌ Password cannot be empty')
    process.exit(1)
  }

  if (password.length < 6) {
    console.error('❌ Password must be at least 6 characters long')
    process.exit(1)
  }

  try {
    console.log('🌱 Starting database seed...')
    console.log(`📝 Creating manager user: ${username}`)

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { username: username.trim() }
    })

    if (existingUser) {
      console.error(`❌ User with username '${username}' already exists`)
      console.error('This script should only be run once to create the initial manager user.')
      process.exit(1)
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12)
    console.log('🔐 Password hashed successfully')

    // Create the manager user
    const manager = await prisma.user.create({
      data: {
        username: username.trim(),
        password: hashedPassword,
        role: 'MANAGER',
        firstName: 'System',
        lastName: 'Manager',
        email: `${username.trim()}@ankh.com`
      },
      select: {
        id: true,
        username: true,
        role: true,
        firstName: true,
        lastName: true,
        email: true,
        createdAt: true
      }
    })

    console.log('✅ Manager user created successfully!')
    console.log('📋 User details:')
    console.log(`   ID: ${manager.id}`)
    console.log(`   Username: ${manager.username}`)
    console.log(`   Role: ${manager.role}`)
    console.log(`   Name: ${manager.firstName} ${manager.lastName}`)
    console.log(`   Email: ${manager.email}`)
    console.log(`   Created: ${manager.createdAt.toISOString()}`)
    console.log('')
    console.log('🔑 You can now login to the system using these credentials.')
    console.log('⚠️  Keep these credentials secure and do not run this script again.')

  } catch (error) {
    console.error('❌ Error creating manager user:', error)
    
    if (error instanceof Error) {
      console.error('Error details:', error.message)
    }
    
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

main()
